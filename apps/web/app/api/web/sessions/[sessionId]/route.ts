import { NextResponse } from "next/server";

import { getSessionById } from "../../../../../lib/store";

type RouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { sessionId } = await params;
  const session = await getSessionById(sessionId);

  if (!session) {
    return NextResponse.json(
      { error: "Session not found." },
      {
        status: 404,
        headers: {
          "cache-control": "no-store",
        },
      },
    );
  }

  return NextResponse.json(
    {
      session: {
        id: session.id,
        filmId: session.filmId,
        filmTitle: session.filmTitle,
        pairCode: session.pairCode,
        startsAt: session.startsAt,
        status: session.status,
        deviceModel: session.deviceModel,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
