import { NextResponse } from "next/server";
import { addClient, removeClient } from "./broadcast";
import { isSpearApiAuthFailure, requireSpearApiAuth } from "@/lib/spear-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSpearApiAuth();
  if (isSpearApiAuthFailure(auth)) return auth;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const id = crypto.randomUUID();
      const encoder = new TextEncoder();
      addClient(id, controller);
      controller.enqueue(encoder.encode("event: connected\ndata: {}\n\n"));
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n"));
        } catch {
          clearInterval(heartbeat);
          removeClient(id);
        }
      }, 30000);
      setTimeout(() => {
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
        removeClient(id);
      }, 300000);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
