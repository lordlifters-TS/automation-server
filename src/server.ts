import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import axios from 'axios';
import { networkInterfaces } from 'os';
import admin from 'firebase-admin';
import * as chrono from "chrono-node";
import { GoogleGenerativeAI } from '@google/generative-ai';

// ══════════════════════════════════════════════════════════════════════════════
//  AUTOMATION SERVER
//  Architecture:
//    Frontend App → Node.js API → Firebase (Firestore) → OpenAI
// ══════════════════════════════════════════════════════════════════════════════

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutomationRule {
  id: string;
  name: string;
  active: boolean;
  triggerType: string;
  actionType: string;
  runCount: number;
  createdAt: string;
  userId?: string;
}

interface ActivityEntry {
  id: string;
  ruleId: string;
  reference: string;
  status: string;
  message: string;
  timestamp: string;
  userId?: string;
}

interface UserRecord {
  uid:       string;
  email:     string;
  createdAt: string;
}

// ─── Crash Guards ─────────────────────────────────────────────────────────────

process.on('uncaughtException',  (err: Error)      => console.error('💥 Uncaught Exception:', err.message));
process.on('unhandledRejection', (reason: unknown) => console.error('💥 Unhandled Rejection:', reason));

// ─── Validate Env ─────────────────────────────────────────────────────────────

const required = ['GEMINI_API_KEY', 'FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌  ${key} is missing from .env`);
    process.exit(1);
  }
}

const PORT       = process.env.PORT          || 3000;
const MODEL      = process.env.GEMINI_MODEL  || 'gemini-1.5-pro';

// ─── Gemini Init ──────────────────────────────────────────────────────────────

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ─── Firebase Init ────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey:  process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

const usersCol    = () => db.collection('users');
const rulesCol    = () => db.collection('automation_rules');
const activityCol = () => db.collection('activity_logs');

console.log('🔥  Firebase connected to project:', process.env.FIREBASE_PROJECT_ID);

// ─── Gemini Helper ────────────────────────────────────────────────────────────

async function callAI(systemPrompt: string, userMessage: string, maxTokens = 800): Promise<string> {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
  });
  const result = await model.generateContent(userMessage);
  const text   = result.response.text();
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

function handleOpenAIError(err: unknown): never {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes('quota') || msg.includes('429'))   throw new Error('⏳ Rate limit hit — wait a few seconds.');
    if (msg.includes('api key') || msg.includes('401')) throw new Error('🔑 Invalid Gemini API key.');
    if (msg.includes('400'))                            throw new Error(`❌ Bad request: ${err.message}`);
    if (msg.includes('503') || msg.includes('unavail')) throw new Error('🌐 Gemini unavailable — try again shortly.');
    if (msg.includes('timeout'))                        throw new Error('⌛ Request timed out.');
    throw err;
  }
  throw new Error('Unknown Gemini error');
}

async function safeCallAI(systemPrompt: string, userMessage: string, maxTokens = 800): Promise<string> {
  try { return await callAI(systemPrompt, userMessage, maxTokens); }
  catch (err) { handleOpenAIError(err); }
}

// ─── Firebase Helpers ─────────────────────────────────────────────────────────

async function logActivity(entry: Omit<ActivityEntry, 'id'>): Promise<ActivityEntry> {
  const ref  = activityCol().doc();
  const full = { ...entry, id: ref.id };
  await ref.set(full);
  return full;
}

async function updateRuleRunCount(ruleId: string): Promise<void> {
  await rulesCol().doc(ruleId).update({
    runCount:  admin.firestore.FieldValue.increment(1),
    lastRunAt: new Date().toISOString(),
  });
}

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin:         '*',
  methods:        ['GET', 'POST', 'OPTIONS', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '10mb' }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`📨  ${req.method} ${req.url}`);
  next();
});

// ─── Async Route Wrapper ──────────────────────────────────────────────────────

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Internal server error';
      console.error('❌  Route Error:', message);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: message, timestamp: new Date().toISOString() });
      }
    });
  };
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Missing Authorization header' });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(header.split(' ')[1]);
    (req as any).uid   = decoded.uid;
    (req as any).email = decoded.email;
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  res.json({
    status:    'online',
    message:   '🤖 Automation Server',
    model:     MODEL,
    firebase:  '✅ Connected',
    uptime:    `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    endpoints: {
      auth:        'POST /api/auth/register  |  POST /api/auth/login  |  GET /api/auth/me',
      ai:          'POST /api/chat | /api/summarize | /api/classify | /api/rewrite | /api/extract | /api/automation/run',
      automations: 'GET|POST /api/automations  |  PATCH /:id/toggle  |  POST /:id/run  |  DELETE /:id',
    },
  });
});

app.get('/api/test', (_req, res) => {
  res.json({ success: true, message: '✅ Server is reachable', model: MODEL, timestamp: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 1 — USER AUTH  (Firebase Auth)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/auth/register', asyncHandler(async (req, res) => {
  const { email, password, displayName } = req.body as { email?: string; password?: string; displayName?: string };
  if (!email?.trim() || !password) { res.status(400).json({ success: false, error: '`email` and `password` are required.' }); return; }

  const userRecord = await admin.auth().createUser({ email: email.trim(), password, displayName });
  await usersCol().doc(userRecord.uid).set({ uid: userRecord.uid, email: userRecord.email!, createdAt: new Date().toISOString() });
  const customToken = await admin.auth().createCustomToken(userRecord.uid);

  res.status(201).json({ success: true, data: { uid: userRecord.uid, email: userRecord.email, customToken }, timestamp: new Date().toISOString() });
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email?.trim()) { res.status(400).json({ success: false, error: '`email` is required.' }); return; }

  const user        = await admin.auth().getUserByEmail(email.trim());
  const customToken = await admin.auth().createCustomToken(user.uid);
  res.json({ success: true, data: { uid: user.uid, email: user.email, customToken }, timestamp: new Date().toISOString() });
}));

app.get('/api/auth/me', requireAuth, asyncHandler(async (req, res) => {
  const uid  = (req as any).uid as string;
  const snap = await usersCol().doc(uid).get();
  if (!snap.exists) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  res.json({ success: true, data: snap.data(), timestamp: new Date().toISOString() });
}));

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 2 — AI ENGINE  (OpenAI)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/chat', asyncHandler(async (req, res) => {
  const { message, systemPrompt = 'You are a helpful AI assistant.' } = req.body as { message?: string; systemPrompt?: string };
  if (!message?.trim()) { res.status(400).json({ success: false, error: '`message` is required.' }); return; }
  const reply = await safeCallAI(systemPrompt, message.trim());
  res.json({ success: true, data: { reply, model: MODEL }, timestamp: new Date().toISOString() });
}));

app.post('/api/summarize', asyncHandler(async (req, res) => {
  const { text, length = 'short' } = req.body as { text?: string; length?: string };
  if (!text?.trim()) { res.status(400).json({ success: false, error: '`text` is required.' }); return; }
  const guide: Record<string, string> = { short: 'in 1-2 sentences', medium: 'in 3-4 sentences', long: 'in a full paragraph' };
  const summary = await safeCallAI(`Summarize the following text clearly ${guide[length] ?? guide.short}. Return only the summary.`, text.trim());
  res.json({ success: true, data: { summary, length, originalLength: text.length, summaryLength: summary.length }, timestamp: new Date().toISOString() });
}));

app.post('/api/classify', asyncHandler(async (req, res) => {
  const { text, categories } = req.body as { text?: string; categories?: string[] };
  if (!text?.trim()) { res.status(400).json({ success: false, error: '`text` is required.' }); return; }
  const categoryList = Array.isArray(categories) && categories.length ? categories.join(', ') : 'Positive, Negative, Neutral, Question, Request, Complaint, Feedback, Other';
  const raw = await safeCallAI(
    `You are a text classifier. Classify the text and respond ONLY with valid JSON (no markdown):\n{"category":"<one of: ${categoryList}>","confidence":"high|medium|low","reason":"one short sentence"}`,
    text.trim(), 200
  );
  let parsed: Record<string, string>;
  try { parsed = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { parsed = { category: raw, confidence: 'medium', reason: 'Raw model response (JSON parse failed)' }; }
  res.json({ success: true, data: { ...parsed, textPreview: text.slice(0, 100) }, timestamp: new Date().toISOString() });
}));

const VALID_TONES = ['professional', 'casual', 'friendly', 'formal', 'concise', 'persuasive', 'simple'] as const;
type Tone = typeof VALID_TONES[number];

app.post('/api/rewrite', asyncHandler(async (req, res) => {
  const { text, tone = 'professional' } = req.body as { text?: string; tone?: string };
  if (!text?.trim()) { res.status(400).json({ success: false, error: '`text` is required.' }); return; }
  if (!VALID_TONES.includes(tone as Tone)) { res.status(400).json({ success: false, error: `Invalid tone. Valid: ${VALID_TONES.join(', ')}` }); return; }
  const rewritten = await safeCallAI(`Rewrite the following text in a ${tone} tone. Preserve the meaning. Return only the rewritten text.`, text.trim());
  res.json({ success: true, data: { original: text, rewritten, tone }, timestamp: new Date().toISOString() });
}));

app.post('/api/extract', asyncHandler(async (req, res) => {
  const { text, fields } = req.body as { text?: string; fields?: string[] };
  if (!text?.trim()) { res.status(400).json({ success: false, error: '`text` is required.' }); return; }
  const fieldList = Array.isArray(fields) && fields.length ? fields.join(', ') : 'name, email, phone, date, location, amount';
  const raw = await safeCallAI(`Extract the following fields from the text and return ONLY valid JSON (no markdown):\nFields: ${fieldList}\nSet any missing fields to null.`, text.trim(), 500);
  let extracted: Record<string, unknown>;
  try { extracted = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { extracted = { raw }; }
  res.json({ success: true, data: { extracted, fieldsRequested: fieldList }, timestamp: new Date().toISOString() });
}));

app.post('/api/automation/run', asyncHandler(async (req, res) => {
  const { task = 'Extract important information', data = '' } = req.body as { task?: string; data?: string };
  const result = await safeCallAI('You are an automation expert. Complete the task clearly and return well-structured results.', `Task: ${task}\nData: ${data}`);
  res.json({ success: true, result, model: MODEL, timestamp: new Date().toISOString() });
}));

// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 3 — AUTOMATION RULES  (Firebase Firestore)
// ══════════════════════════════════════════════════════════════════════════════

app.get('/api/automations', asyncHandler(async (req, res) => {
  const uid = req.query.userId as string | undefined;
  let query: FirebaseFirestore.Query = rulesCol();
  if (uid) query = query.where('userId', '==', uid);
  const snap  = await query.orderBy('createdAt', 'desc').get();
  const rules = snap.docs.map(d => d.data() as AutomationRule);
  res.json({ success: true, data: rules, count: rules.length, timestamp: new Date().toISOString() });
}));

app.get('/api/automations/stats', asyncHandler(async (_req, res) => {
  const snap        = await rulesCol().get();
  const rules       = snap.docs.map(d => d.data() as AutomationRule);
  const activeRules = rules.filter(r => r.active).length;
  const runsSum     = rules.reduce((acc, r) => acc + (r.runCount || 0), 0);
  res.json({
    success: true,
    data: { totalRules: rules.length, activeRules, inactiveRules: rules.length - activeRules, totalRuns: runsSum, serverUptime: `${Math.floor(process.uptime())}s` },
    timestamp: new Date().toISOString(),
  });
}));

app.get('/api/automations/recent', asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const snap  = await activityCol().orderBy('timestamp', 'desc').limit(limit).get();
  const logs  = snap.docs.map(d => d.data() as ActivityEntry);
  res.json({ success: true, data: logs, count: logs.length, timestamp: new Date().toISOString() });
}));

app.post('/api/automations', asyncHandler(async (req, res) => {
  const { name, active = true, triggerType = 'manual', actionType = 'notify_admin', userId } = req.body as Partial<AutomationRule>;
  if (!name?.trim()) { res.status(400).json({ success: false, error: '`name` is required.' }); return; }

  const ref  = rulesCol().doc();
  const rule: AutomationRule = {
    id: ref.id, name: name.trim(), active, triggerType, actionType, runCount: 0,
    createdAt: new Date().toISOString(), ...(userId && { userId }),
  };
  await ref.set(rule);
  res.status(201).json({ success: true, data: rule, timestamp: new Date().toISOString() });
}));

app.patch('/api/automations/:id/toggle', asyncHandler(async (req, res) => {
  const ref  = rulesCol().doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) { res.status(404).json({ success: false, error: `Rule "${req.params.id}" not found.` }); return; }

  const rule      = snap.data() as AutomationRule;
  const newActive = typeof (req.body as { active?: boolean }).active === 'boolean'
    ? (req.body as { active: boolean }).active : !rule.active;

  await ref.update({ active: newActive });
  res.json({ success: true, data: { ...rule, active: newActive }, timestamp: new Date().toISOString() });
}));

app.post('/api/automations/:id/run', asyncHandler(async (req, res) => {
  const ref  = rulesCol().doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) { res.status(404).json({ success: false, error: `Rule "${req.params.id}" not found.` }); return; }

  const rule = snap.data() as AutomationRule;
  if (!rule.active) { res.status(400).json({ success: false, error: `Rule "${rule.name}" is inactive.` }); return; }

  const message = await safeCallAI(
    'You are an automation expert. Briefly describe in 1-2 sentences what happened when this automation ran successfully.',
    `Automation: "${rule.name}" | Trigger: ${rule.triggerType} | Action: ${rule.actionType}`
  );

  await updateRuleRunCount(rule.id);

  const entry = await logActivity({
    ruleId: rule.id, reference: `${rule.name} — ${rule.actionType}`, status: 'success',
    message, timestamp: new Date().toISOString(), ...(rule.userId && { userId: rule.userId }),
  });

  res.json({ success: true, data: { message, rule: { ...rule, runCount: rule.runCount + 1 }, activity: entry }, timestamp: new Date().toISOString() });
}));

app.delete('/api/automations/:id', asyncHandler(async (req, res) => {
  const ref  = rulesCol().doc(req.params.id);
  const snap = await ref.get();
  if (!snap.exists) { res.status(404).json({ success: false, error: `Rule "${req.params.id}" not found.` }); return; }
  const deleted = snap.data();
  await ref.delete();
  res.json({ success: true, data: { deleted }, timestamp: new Date().toISOString() });
}));


// ══════════════════════════════════════════════════════════════════════════════
//  LAYER 4 — EMAIL → TASK AUTOMATION (Webhook)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/email-webhook', asyncHandler(async (req, res) => {

  const { subject, body, from } = req.body as {
    subject?: string;
    body?: string;
    from?: string;
  };

  if (!subject?.trim() || !body?.trim()) {
    res.status(400).json({ success: false, error: '`subject` and `body` are required.' });
    return;
  }

  // Optional security filter
  if (process.env.AUTHORIZED_SENDER && from !== process.env.AUTHORIZED_SENDER) {
    res.status(403).json({ success: false, error: 'Unauthorized sender.' });
    return;
  }

  // Parse natural language due date
  const dueDate = chrono.parseDate(body);

  // ─── Create Trello Card ─────────────────────────

  const trelloResponse = await axios.post(
    `https://api.trello.com/1/cards`,
    null,
    {
      params: {
        key: process.env.TRELLO_KEY,
        token: process.env.TRELLO_TOKEN,
        idList: process.env.TRELLO_LIST_ID,
        name: subject.trim(),
        desc: body.trim(),
        due: dueDate ? dueDate.toISOString() : null,
      },
    }
  );

  // ─── Notify Slack ───────────────────────────────

  if (process.env.SLACK_WEBHOOK_URL) {
    await axios.post(process.env.SLACK_WEBHOOK_URL, {
      text: `📌 Task created from email: *${subject}* (due: ${dueDate ?? 'N/A'})`,
    });
  }

  res.json({
    success: true,
    data: {
      message: 'Task created successfully',
      trelloCardId: trelloResponse.data.id,
      dueDate: dueDate ?? null,
    },
    timestamp: new Date().toISOString(),
  });

}));

// ─── 404 Catch-all ────────────────────────────────────────────────────────────

app.use('*', (req: Request, res: Response): void => {
  res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  const line = '═'.repeat(60);
  console.log(`\n${line}`);
  console.log('🚀  AUTOMATION SERVER');
  console.log(line);
  console.log(`📡  Local:   http://localhost:${PORT}`);

  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface ?? []) {
      if (net.family === 'IPv4' && !net.internal)
        console.log(`📱  Network: http://${net.address}:${PORT}`);
    }
  }

  console.log(`\n🔮  Gemini:   ✅ Loaded  (model: ${MODEL})`);
  console.log(`🔥  Firebase: ✅ Connected (${process.env.FIREBASE_PROJECT_ID})`);
  console.log(`🌐  CORS:     ✅ Open`);
  console.log(`${line}\n`);
});