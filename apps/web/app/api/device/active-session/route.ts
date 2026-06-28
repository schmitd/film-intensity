import { NextResponse } from "next/server";

import { activeDeviceSessionResponseSchema } from "@film-intensity/shared";

import { getActiveSession } from "../../../../lib/store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId") ?? undefined;
  const deviceToken = searchParams.get("deviceToken") ?? undefined;
  const session = await getActiveSession(deviceId, deviceToken);

  if (!session) {
    return NextResponse.json(activeDeviceSessionResponseSchema.parse({ session: null }));
  }

  return NextResponse.json(
    activeDeviceSessionResponseSchema.parse({
      session: {
        id: session.id,
        filmId: session.filmId,
        filmTitle: session.filmTitle,
        runtimeMinutes: session.runtimeMinutes,
        pairCode: session.pairCode,
        startsAt: session.startsAt,
        status: session.status,
        capabilities: session.capabilities,
      },
    }),
  );
}
