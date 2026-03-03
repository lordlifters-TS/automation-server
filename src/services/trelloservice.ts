export async function createTrelloCard(subject, body, dueDate) {
  const response = await fetch(
    `https://api.trello.com/1/cards?key=${process.env.TRELLO_KEY}&token=${process.env.TRELLO_TOKEN}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: subject,
        desc: body,
        idList: process.env.TRELLO_LIST_ID,
        due: dueDate || null,
      }),
    }
  );

  return response.json();
}