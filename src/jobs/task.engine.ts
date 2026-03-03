import { runAI } from "../services/openaiservice.js";

export async function processTask(type: string, task: string, data: string) {

  const prompt = `
You are an AI automation system.

AUTOMATION TYPE: ${type}
TASK: ${task}

INPUT:
${data}

Return:

1) Clean structured JSON
2) Short clear human summary
3) Any detected important fields
`;

  const result = await runAI(prompt);

  return {
    type,
    task,
    output: result,
    processedAt: new Date().toISOString()
  };
}
