import { Router, Request, Response, NextFunction } from 'express';
import { TestController } from '../controllers/test.controller.js';

const router     = Router();
const controller = new TestController();

// ─── Async Wrapper ────────────────────────────────────────────────────────────

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// ─── Routes ───────────────────────────────────────────────────────────────────

router.get ('/',          wrap(controller.healthCheck.bind(controller)));
router.get ('/test',      wrap(controller.testGet.bind(controller)));
router.post('/test-post', wrap(controller.testPost.bind(controller)));

// ─── Error Handlers ───────────────────────────────────────────────────────────

router.use((_req: Request, res: Response) =>
  res.status(404).json({ success: false, error: 'Route not found.' })
);

router.use((err: Error, _req: Request, res: Response, _next: NextFunction) =>
  res.status(500).json({ success: false, error: err.message || 'Internal server error.' })
);

export default router;