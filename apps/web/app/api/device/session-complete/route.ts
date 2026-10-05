import { NextResponse } from "next/server";

import { sessionCompleteSchema } from "@film-intensity/shared";

import { completeSession } from "../../../../lib/store";
import { SessionUploadConflict } from "../../../../lib/session-upload";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = sessionCompleteSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid completion payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let session;
  try {
    session = await completeSession(parsed.data);
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
    sessionId: session.id,
    status: session.status,
    totalSamples: session.samples.length,
  });
}
