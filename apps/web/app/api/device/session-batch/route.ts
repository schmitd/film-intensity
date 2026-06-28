import { NextResponse } from "next/server";

import { sessionBatchSchema } from "@film-intensity/shared";

import { appendSamples } from "../../../../lib/store";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = sessionBatchSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid session batch.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const session = await appendSamples(parsed.data);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  return NextResponse.json({
    acceptedSamples: parsed.data.samples.length,
    sessionStatus: session.status,
    totalSamples: session.samples.length,
  });
}
