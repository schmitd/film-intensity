import { NextResponse } from "next/server";

import { sessionStartSchema } from "@film-intensity/shared";

import { startSession } from "../../../../lib/store";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = sessionStartSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session start payload.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const session = await startSession(parsed.data);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({
    sessionId: session.id,
    status: session.status,
  });
}
