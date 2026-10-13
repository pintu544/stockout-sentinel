// Server-only InfiniSynapse client. The API key never leaves the server.

const BASE = process.env.INFINISYNAPSE_BASE_URL ?? "https://app.infinisynapse.com";

function headers(): Record<string, string> {
  const key = process.env.INFINISYNAPSE_API_KEY;
  if (!key) throw new Error("INFINISYNAPSE_API_KEY is not set");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "x-lang": "en",
  };
}

interface Envelope<T> {
  code: number;
  message: string;
  data: T;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`InfiniSynapse ${path} -> HTTP ${res.status}`);
  const body = (await res.json()) as Envelope<T>;
  if (body.code !== 200)
    throw new Error(`InfiniSynapse ${path} -> code ${body.code}: ${body.message}`);
  return body.data;
}

/** Lightweight reachability + auth check: list one data source. */
export async function infiniPing(): Promise<boolean> {
  try {
    await call<{ items: unknown[] }>("/api/ai_database/list?page=1&pageSize=1&source=all");
    return true;
  } catch {
    return false;
  }
}

export interface NewTaskResult {
  taskId: string;
  connId: string;
}

/** Create an analysis task. Returns after the server accepts it (not after completion). */
export async function createAnalysisTask(prompt: string): Promise<NewTaskResult> {
  const connId = crypto.randomUUID();
  const data = await call<{ success: boolean; taskId?: string }>(
    "/api/ai/message",
    {
      method: "POST",
      body: JSON.stringify({ type: "newTask", text: prompt, connId }),
    }
  );
  if (!data?.success) throw new Error("InfiniSynapse rejected the new task");
  // Server may echo the taskId; if absent we track by connId via the stream.
  return { taskId: data.taskId ?? connId, connId };
}

/** Fetch the slim UI messages for a task (used to extract the final JSON block). */
export async function getTaskMessages(taskId: string): Promise<unknown[]> {
  const data = await call<{ messages?: unknown[] }>(
    `/api/ai_task/getUiMessageById?id=${encodeURIComponent(taskId)}`
  );
  return data?.messages ?? [];
}
