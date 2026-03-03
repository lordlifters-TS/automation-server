import { v4 as uuid } from "uuid";

const jobs = new Map();

export async function addJob(data: any) {
  const id = uuid();
  jobs.set(id, { status: "queued", data });

  processJob(id);

  return id;
}

async function processJob(id: string) {
  jobs.set(id, { ...jobs.get(id), status: "processing" });

  // simulate automation
  await new Promise(r => setTimeout(r, 3000));

  jobs.set(id, { ...jobs.get(id), status: "completed" });
}

export function getJob(id: string) {
  return jobs.get(id);
}
