import { NextResponse } from "next/server";

import { getFilmMoments } from "../../../../../../lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filmId: string }> },
) {
  const { filmId } = await params;
  const moments = await getFilmMoments(filmId);

  return NextResponse.json({
    filmId,
    moments,
  });
}
