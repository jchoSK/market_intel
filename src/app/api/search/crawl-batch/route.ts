import { runCrawlBatch, type CrawlBatchItem, type SearchEvent } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600; // 10 minutes - handles batches of 5 parallel crawls (Hobby plan)

interface CrawlBatchPayload {
  businesses: CrawlBatchItem[];
}

function parsePayload(payloadParam: string | null): CrawlBatchPayload {
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
  const payload = parsed as CrawlBatchPayload;
  if (!Array.isArray(payload.businesses)) {
    throw new Error("Missing or invalid businesses array.");
  }
  return payload;
}

export async function GET(req: Request) {
  console.log('[CrawlBatchStream] Request received');

  let payload: CrawlBatchPayload;

  try {
    const url = new URL(req.url);
    const payloadParam = url.searchParams.get("payload");
    console.log('[CrawlBatchStream] Payload param length:', payloadParam?.length || 0);
    payload = parsePayload(payloadParam);
    console.log('[CrawlBatchStream] Parsed payload:', payload.businesses.length, 'businesses');
  } catch (error: any) {
    console.error('[CrawlBatchStream] Parameter parsing error:', error);
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
        console.error(`[CrawlBatchStream] Error writing event ${event}:`, err);
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
      // Send initial event to establish connection
      await writeEvent("log", { level: "info", message: "Crawl batch connection established" });
      console.log('[CrawlBatchStream] Initial event sent successfully');

      // Start heartbeat to keep connection alive (Cloud Run requirement)
      heartbeatInterval = setInterval(async () => {
        try {
          await writer.write(encoder.encode(': heartbeat\n\n'));
          console.log('[CrawlBatchStream] Heartbeat sent');
        } catch (err) {
          console.error('[CrawlBatchStream] Heartbeat failed:', err);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 15000);

    } catch (err) {
      console.error('[CrawlBatchStream] Error sending initial event:', err);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      await writer.close().catch(() => {});
      return;
    }

    runCrawlBatch(payload.businesses, {
      onEvent: async (event: SearchEvent) => {
        try {
          if (event.type === "progress") {
            await writeEvent("progress", event);
          } else if (event.type === "log") {
            await writeEvent("log", event);
          }
        } catch (err) {
          console.error('[CrawlBatchStream] Error in onEvent handler:', err);
        }
      },
      signal: req.signal,
    })
    .then(async (result) => {
      try {
        await writeEvent("complete", result);
      } catch (err) {
        console.error('[CrawlBatchStream] Error writing complete event:', err);
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await writer.close().catch((err) => console.error('[CrawlBatchStream] Error closing writer:', err));
      }
    })
    .catch(async (error: any) => {
      try {
        console.error("[CrawlBatchStream] Error:", error?.message);
        await writeEvent("crawl-error", {
          message: error?.message || "Unexpected error during crawl batch",
        });
      } catch (err) {
        console.error("[CrawlBatchStream] Error writing error event:", err);
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await writer.close().catch((err) => console.error('[CrawlBatchStream] Error closing writer:', err));
      }
    })
    .finally(() => {
      req.signal?.removeEventListener("abort", abort);
    });
  })(); // Execute the async IIFE immediately

  console.log('[CrawlBatchStream] Returning SSE response');
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable proxy buffering for Cloud Run/nginx
    },
  });
}
