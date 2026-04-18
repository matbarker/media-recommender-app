import { NextRequest, NextResponse } from "next/server";
import { getShowById, getMentionsForShow, getShowWeeklySentiment } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const showId = parseInt(id);
    if (isNaN(showId)) {
      return NextResponse.json({ error: "Invalid show ID" }, { status: 400 });
    }

    const show = getShowById(showId);
    if (!show) {
      return NextResponse.json({ error: "Show not found" }, { status: 404 });
    }

    const mentions = getMentionsForShow(showId);
    const weeklySentiment = getShowWeeklySentiment(showId);

    // Calculate average sentiment
    const avgSentiment = mentions.length > 0
      ? mentions.reduce((sum, m) => sum + m.sentiment_score, 0) / mentions.length
      : 5.0;

    return NextResponse.json({
      show,
      avgSentiment: Math.round(avgSentiment * 10) / 10,
      mentions,
      weeklySentiment,
    });
  } catch (err) {
    console.error("GET /api/shows/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch show" }, { status: 500 });
  }
}
