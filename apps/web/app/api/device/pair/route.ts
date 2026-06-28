import { NextResponse } from "next/server";

import { pairDeviceRequestSchema } from "@film-intensity/shared";

import { pairDevice } from "../../../../lib/store";

export async function POST(request: Request) {
  const payload = await request.json();
  const parsed = pairDeviceRequestSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid pair request.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const session = await pairDevice(parsed.data);

  if (!session || !session.deviceToken) {
    return NextResponse.json({ error: "Pair code not found." }, { status: 404 });
  }

  return NextResponse.json({
    deviceToken: session.deviceToken,
    userId: session.userId,
    activeSessionId: session.id,
  });
}
