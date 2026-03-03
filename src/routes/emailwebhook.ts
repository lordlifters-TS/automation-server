import express from "express";
import chrono from "chrono-node";
import { createTrelloCard } from "../services/trelloService.js";
import { notifySlack } from "../services/slackService.js";

const router = express.Router();

router.post("/email-webhook", async (req, res) => {
  try {
    const { subject, body, from } = req.body;

    // Basic validation
    if (!subject || !body) {
      return res.status(400).json({ error: "Missing subject or body" });
    }

    // Optional sender filter
    if (from !== process.env.AUTHORIZED_SENDER) {
      return res.status(403).json({ error: "Unauthorized sender" });
    }

    // Parse due date from body
    const dueDate = chrono.parseDate(body);

    // Create Trello task
    await createTrelloCard(subject, body, dueDate);

    // Notify Slack
    await notifySlack(subject, dueDate);

    res.status(200).json({ message: "Task created successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;