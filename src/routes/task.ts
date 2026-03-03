import { Router } from "express";
import { getJob } from "../queue/jobQueue";

const router = Router();

router.get("/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ message: "Not found" });

  res.json(job);
});

export default router;
