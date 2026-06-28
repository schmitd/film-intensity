import { NextResponse } from "next/server";

import { searchMovies } from "../../../../../lib/tmdb";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";

  try {
    return NextResponse.json({
      films: await searchMovies(query),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Movie search is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
