export async function notifySlack(subject, dueDate) {
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `📌 Task created: ${subject} (due: ${dueDate || "N/A"})`,
    }),
  });
}