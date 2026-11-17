import { NextResponse } from "next/server";

import { sessionBatchSchema } from "@film-intensity/shared";

import { appendSamples } from "../../../../lib/store";
import { SessionUploadConflict } from "../../../../lib/session-upload";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = sessionBatchSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session batch.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let session;
  try {
    session = await appendSamples(parsed.data);
  } catch (error) {
    if (error instanceof SessionUploadConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({
    // This is an acknowledged prefix length, not the number of new stored rows.
    // The watch must dequeue an already-persisted batch after a lost response.
    acceptedSamples: parsed.data.samples.length,
    sessionStatus: session.status,
    totalSamples: session.samples.length,
  });
}
