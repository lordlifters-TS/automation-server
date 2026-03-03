import { Router } from "express";
import { aiController } from "../controllers/ai.controller.js";

const router = Router();

router.post("/query", aiController);

export default router;
