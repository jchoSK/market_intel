import { runDirectBusinessSearch, type SearchEvent, type DirectInputBusinessPayload } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes per business

function parsePayload(payloadParam: string | null): DirectInputBusinessPayload {
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
  const business = parsed as DirectInputBusinessPayload;
  if (!business.businessName || typeof business.businessName !== "string") {
    throw new Error("Missing or invalid businessName in payload.");
  }
  return business;
}

export async function GET(req: Request) {
  console.log('[DirectSearchStream] Request received');

  let business: DirectInputBusinessPayload;

  try {
    const url = new URL(req.url);
    const payloadParam = url.searchParams.get("payload");
    console.log('[DirectSearchStream] Payload param length:', payloadParam?.length || 0);
    business = parsePayload(payloadParam);
    console.log('[DirectSearchStream] Parsed business:', JSON.stringify(business));
  } catch (error: any) {
    console.error('[DirectSearchStream] Parameter parsing error:', error);
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
        console.error(`[DirectSearchStream] Error writing event ${event}:`, err);
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
      await writeEvent("log", { level: "info", message: "Connection established" });
      console.log('[DirectSearchStream] Initial event sent successfully');

      // Start heartbeat to keep connection alive
      heartbeatInterval = setInterval(async () => {
        try {
          await writer.write(encoder.encode(': heartbeat\n\n'));
          console.log('[DirectSearchStream] Heartbeat sent');
        } catch (err) {
          console.error('[DirectSearchStream] Heartbeat failed:', err);
          if (heartbeatInterval) clearInterval(heartbeatInterval);
        }
      }, 15000);

    } catch (err) {
      console.error('[DirectSearchStream] Error sending initial event:', err);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      await writer.close().catch(() => {});
      return;
    }

    runDirectBusinessSearch(business, {
      onEvent: async (event: SearchEvent) => {
        try {
          if (event.type === "progress") {
            await writeEvent("progress", event);
          } else if (event.type === "log") {
            await writeEvent("log", event);
          }
        } catch (err) {
          console.error('[DirectSearchStream] Error in onEvent handler:', err);
        }
      },
      signal: req.signal,
    })
    .then(async (result) => {
      try {
        await writeEvent("complete", result);
      } catch (err) {
        console.error('[DirectSearchStream] Error writing complete event:', err);
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await writer.close().catch((err) => console.error('[DirectSearchStream] Error closing writer:', err));
      }
    })
    .catch(async (error: any) => {
      try {
        console.error("[DirectSearchStream] Error:", error?.message);
        await writeEvent("search-error", {
          message: error?.message || "Unexpected error during analysis",
        });
      } catch (err) {
        console.error("[DirectSearchStream] Error writing error event:", err);
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        await writer.close().catch((err) => console.error('[DirectSearchStream] Error closing writer:', err));
      }
    })
    .finally(() => {
      req.signal?.removeEventListener("abort", abort);
    });
  })();

  console.log('[DirectSearchStream] Returning SSE response');
  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
