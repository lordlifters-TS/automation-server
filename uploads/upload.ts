import { Router } from "express";
import multer from "multer";
import { addJob } from "../queue/jobqueue";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("file"), async (req, res) => {
  const jobId = await addJob({
    type: "FILE_PROCESS",
    path: req.file?.path
  });

  res.json({ jobId, status: "queued" });
});

export default router;
