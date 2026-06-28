import { NextResponse } from "next/server";

import { createFilmSessionRequestSchema } from "@film-intensity/shared";

import { createSession, listSessions } from "../../../../lib/store";

export async function GET() {
  return NextResponse.json({ sessions: await listSessions() });
}

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = createFilmSessionRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!parsed.data.consentAccepted) {
    return NextResponse.json(
      { error: "Consent must be accepted before creating a session." },
      { status: 400 },
    );
  }

  const session = await createSession(parsed.data);

  return NextResponse.json(
    {
      session,
    },
    { status: 201 },
  );
}
