import fs from "fs/promises";
import * as pdfParse from "pdf-parse";



import { processTask } from "../jobs/task.engine.js";
import type { Request, Response } from "express";

export async function handleUpload(req: Request, res: Response) {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    let content = "";

    // ✅ PDF handling
    if (file.mimetype === "application/pdf") {
      const dataBuffer = await fs.readFile(file.path);
      const pdfData = await pdfParse.default(dataBuffer);


      content = pdfData.text;
    } 
    // ✅ Text fallback
    else {
      content = await fs.readFile(file.path, "utf8");
    }

    // ✅ Send extracted text to automation engine
    const result = await processTask(
      "document",
      "Extract important information",
      content
    );

    res.json({
      success: true,
      extracted: result
    });

  } catch (err) {
    console.error("UPLOAD ERROR:", err);
    res.status(500).json({ error: "File processing failed" });
  }
}
