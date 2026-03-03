import { Request, Response } from "express";

export const aiController = async (req: Request, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    res.json({
      success: true,
      message: `Received: ${prompt}`
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
};
