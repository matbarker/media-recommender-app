import { NextRequest, NextResponse } from "next/server";
import { backfillThreads } from "@/lib/scraper";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const count = Math.min(Math.max(1, body.count || 10), 52); // max 52 weeks

    const results = await backfillThreads(count);
    return NextResponse.json({ results });
  } catch (err) {
    console.error("POST /api/backfill error:", err);
    return NextResponse.json(
      { error: `Backfill failed: ${err}` },
      { status: 500 }
    );
  }
}
