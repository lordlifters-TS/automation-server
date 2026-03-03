import 'dotenv/config';
import fetch from 'node-fetch';

const API_KEY = process.env.GROQ_API_KEY;
const BASE_URL = 'https://api.groq.com/openai/v1';

if (!API_KEY) {
  console.error('❌ GROQ_API_KEY is missing! Add it to your .env file.');
  process.exit(1);
}

// ─── List Available Models ────────────────────────────────────────────────────

async function listModels(): Promise<void> {
  console.log('📡 Fetching available Groq models...\n');

  const res = await fetch(`${BASE_URL}/models`, {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`HTTP ${res.status}: ${error}`);
  }

  const data = await res.json() as { data: { id: string; owned_by: string }[] };

  console.log(`✅ Found ${data.data.length} models:\n`);
  data.data.forEach((model) => {
    console.log(`  • ${model.id}  (${model.owned_by})`);
  });
}

// ─── Test Chat Completion ─────────────────────────────────────────────────────

async function testChat(message: string): Promise<void> {
  console.log(`\n💬 Sending test message: "${message}"\n`);

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [{ role: 'user', content: message }],
      max_tokens: 200,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`HTTP ${res.status}: ${error}`);
  }

  const data = await res.json() as {
    choices: { message: { content: string } }[];
    usage: { total_tokens: number };
  };

  const reply = data.choices[0]?.message?.content ?? '(no response)';
  console.log(`🤖 Reply: ${reply}`);
  console.log(`📊 Tokens used: ${data.usage.total_tokens}`);
}

// ─── Run Tests ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    await listModels();
    await testChat('Say hello in one sentence.');
    console.log('\n✅ Groq API is working correctly!');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Test failed: ${message}`);
    process.exit(1);
  }
}

main();