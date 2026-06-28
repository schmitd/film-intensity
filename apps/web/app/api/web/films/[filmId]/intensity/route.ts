import { NextResponse } from "next/server";

import { getFilmBuckets } from "../../../../../../lib/store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filmId: string }> },
) {
  const { filmId } = await params;
  const buckets = await getFilmBuckets(filmId);

  return NextResponse.json({
    filmId,
    buckets,
  });
}
