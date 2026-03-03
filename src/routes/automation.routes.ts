import { Router, Request, Response, NextFunction } from 'express';
import { AutomationController } from '../controllers/automation.controller.js';

const router     = Router();
const controller = new AutomationController();

// ─── Async Wrapper ────────────────────────────────────────────────────────────

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res, next).catch(next);

// ─── Routes ───────────────────────────────────────────────────────────────────

router.post('/summarize', wrap(controller.summarize.bind(controller)));
router.post('/classify',  wrap(controller.classify.bind(controller)));
router.post('/run',       wrap(controller.runAutomation.bind(controller)));

// ─── Error Handlers ───────────────────────────────────────────────────────────

router.use((_req: Request, res: Response) =>
  res.status(404).json({ success: false, error: 'Automation route not found.' })
);

router.use((err: Error, _req: Request, res: Response, _next: NextFunction) =>
  res.status(500).json({ success: false, error: err.message || 'Internal server error.' })
);

export default router;