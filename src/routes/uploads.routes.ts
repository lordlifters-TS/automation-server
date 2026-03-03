import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { addJob } from '../queue/jobQueue';

const router = Router();

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',       // .xlsx
  'image/jpeg',
  'image/png',
  'image/webp',
];

const UPLOAD_DIR = 'uploads';

// ─── Ensure Upload Directory Exists ──────────────────────────────────────────

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ─── Multer Config ────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    const timestamp = Date.now();
    const ext       = path.extname(file.originalname).toLowerCase();
    const safe      = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${safe}_${timestamp}${ext}`);
  },
});

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type "${file.mimetype}" is not allowed.`));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ─── POST /upload ─────────────────────────────────────────────────────────────

router.post('/', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: 'No file uploaded. Include a file in the `file` field of your form-data.',
      });
      return;
    }

    const { originalname, mimetype, size, path: filePath, filename } = req.file;

    console.log(`📁 File received: ${originalname} (${(size / 1024).toFixed(1)} KB)`);

    const jobId = await addJob({
      type:         'FILE_PROCESS',
      path:         filePath,
      originalName: originalname,
      mimeType:     mimetype,
      sizeBytes:    size,
    });

    res.status(202).json({
      success:  true,
      jobId,
      file: {
        name:      originalname,
        savedAs:   filename,
        mimeType:  mimetype,
        sizeKB:    parseFloat((size / 1024).toFixed(2)),
      },
      message:  'File queued for processing.',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    console.error('❌ Upload error:', message);
    res.status(500).json({ success: false, error: message });
  }
});

// ─── Multer Error Handler ─────────────────────────────────────────────────────

router.use((err: Error, _req: Request, res: Response, _next: Function): void => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`,
      });
      return;
    }
    res.status(400).json({ success: false, error: `Upload error: ${err.message}` });
    return;
  }

  // fileFilter rejection or other errors
  res.status(400).json({ success: false, error: err.message });
});

export default router;