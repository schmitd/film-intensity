import { NextResponse } from "next/server";

import { sessionCompleteSchema } from "@film-intensity/shared";

import { completeSession } from "../../../../lib/store";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = sessionCompleteSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid completion payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const session = await completeSession(parsed.data);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
    totalSamples: session.samples.length,
  });
}
