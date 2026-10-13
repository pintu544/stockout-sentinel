import { mockResult } from "@/lib/analysis";

// Server-only. Relays InfiniSynapse SSE progress to the browser client.
// In mock mode emits synthetic progress events then the local result.

const BASE = process.env.INFINISYNAPSE_BASE_URL ?? "https://app.infinisynapse.com";
const isMock = () => process.env.MOCK_ANALYSIS !== "false";

function sse(data: string, event = "progress"): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

/** GET /api/analysis/stream?connId= -> text/event-stream */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const connId = searchParams.get("connId");
  if (!connId) {
    return new Response(sse(JSON.stringify({ error: "connId required" }), "error"), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => controller.enqueue(new TextEncoder().encode(chunk));
      const heartbeat = setInterval(() => send(`: ping\n\n`), 15_000);
      try {
        if (isMock()) {
          const steps = [
            "Connecting to stockout_sentinel_pg…",
            "Scanning 60 SKUs, trailing 28-day demand…",
            "Computing days of cover and stockout dates…",
            "Ranking by revenue at risk…",
          ];
          for (const text of steps) {
            send(sse(JSON.stringify({ text })));
            await new Promise((r) => setTimeout(r, 700));
          }
          const result = await mockResult();
          send(sse(JSON.stringify({ done: true, result }), "done"));
        } else {
          const key = process.env.INFINISYNAPSE_API_KEY;
          const upstream = await fetch(
            `${BASE}/api/ai/events?connId=${encodeURIComponent(connId)}`,
            { headers: { Authorization: `Bearer ${key}`, Accept: "text/event-stream", "x-lang": "en" } }
          );
          if (!upstream.ok || !upstream.body) throw new Error(`upstream ${upstream.status}`);
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const parts = buf.split("\n\n");
            buf = parts.pop() ?? "";
            for (const part of parts) {
              const ev = /event:\s*(\S+)/.exec(part)?.[1] ?? "message";
              const data = /data:\s*([\s\S]*)/.exec(part)?.[1] ?? "{}";
              if (["message.partial", "message.add", "notification", "state.ready"].includes(ev)) {
                send(`event: ${ev}\ndata: ${data}\n\n`);
              }
              if (ev === "state.ready") {
                // Upstream signals the task finished; keep the stream open a
                // beat so the client can fetch the result, then close.
                await new Promise((r) => setTimeout(r, 500));
                return;
              }
            }
          }
        }
      } catch (e) {
        send(sse(JSON.stringify({ error: e instanceof Error ? e.message : "stream failed" }), "error"));
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
