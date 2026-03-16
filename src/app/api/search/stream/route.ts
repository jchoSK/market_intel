import type { SearchParams } from "@/types";
import { runBusinessSearch, type SearchEvent } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes - handles large searches with batched processing

function parseSearchParams(payloadParam: string | null): SearchParams {
  if (!payloadParam) {
    throw new Error("Missing payload parameter.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadParam);
  } catch (error) {
    try {
      parsed = JSON.parse(decodeURIComponent(payloadParam));
    } catch {
      throw new Error("Invalid payload parameter.");
    }
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid payload structure.");
  }
  return parsed as SearchParams;
}

export async function GET(req: Request) {
  console.log('[SearchStream] Request received');

  let params: SearchParams;

  try {
    const url = new URL(req.url);
    const payloadParam = url.searchParams.get("payload");
    console.log('[SearchStream] Payload param length:', payloadParam?.length || 0);
    params = parseSearchParams(payloadParam);
    console.log('[SearchStream] Parsed params:', JSON.stringify(params));
  } catch (error: any) {
    console.error('[SearchStream] Parameter parsing error:', error);
    return new Response(JSON.stringify({ error: error?.message || "Invalid request" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Serialize writes to prevent interleaving
  let writeQueue = Promise.resolve();
  const writeEvent = async (event: string, data: unknown) => {
    writeQueue = writeQueue.then(async () => {
      try {
        const payload = typeof data === "string" ? data : JSON.stringify(data);
        await writer.write(encoder.encode(`event: ${event}\n`));
        await writer.write(encoder.encode(`data: ${payload}\n\n`));
      } catch (err) {
        console.error(`[SearchStream] Error writing event ${event}:`, err);
        throw err;
      }
    });
    return writeQueue;
  };

  const abort = () => {
    writer.close().catch(() => {});
  };

  // Close the writer if the client disconnects early
  req.signal?.addEventListener("abort", abort, { once: true });

  // Start the async processing in the background
  (async () => {
    let heartbeatInterval: NodeJS.Timeout | null = null;

    try {
      // Send initial event to establish connection - MUST await to ensure it's sent
      await writeEvent("log", { level: "info", message: "Connection established" });
      console.log('[SearchStream] Initial event sent successfully');

      // Start heartbeat to keep connection alive (Cloud Run requirement)
      // Send a comment every 15 seconds to prevent timeout
      heartbeatInterval = setInterval(async () => {
        try {
          await writer.write(encoder.encode(': heartbeat\n\n'));
          console.log('[SearchStream] Heartbeat sent');
        } catch (err) {
          console.error('[SearchStream] Heartbeat failed:', err);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 15000);

    } catch (err) {
      console.error('[SearchStream] Error sending initial event:', err);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      await writer.close().catch(() => {});
      return;
    }

    runBusinessSearch(params, {
      onEvent: async (event: SearchEvent) => {
        try {
          if (event.type === "progress") {
            await writeEvent("progress", event);
          } else if (event.type === "log") {
            await writeEvent("log", event);
          }
        } catch (err) {
          console.error('[SearchStream] Error in onEvent handler:', err);
        }
      },
      signal: req.signal,
    })
    .then(async (result) => {
      try {
        await writeEvent("complete", result);
      } catch (err) {
        console.error('[SearchStream] Error writing complete event:', err);
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await writer.close().catch((err) => console.error('[SearchStream] Error closing writer:', err));
      }
    })
    .catch(async (error: any) => {
      try {
        console.error("[SearchStream] Error:", error?.message);
        await writeEvent("search-error", {
          message: error?.message || "Unexpected error during search",
        });
      } catch (err) {
        console.error("[SearchStream] Error writing error event:", err);
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await writer.close().catch((err) => console.error('[SearchStream] Error closing writer:', err));
      }
    })
    .finally(() => {
      req.signal?.removeEventListener("abort", abort);
    });
  })(); // Execute the async IIFE immediately

  console.log('[SearchStream] Returning SSE response');
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable proxy buffering for Cloud Run/nginx
    },
  });
}
