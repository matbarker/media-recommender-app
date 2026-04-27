import { NextRequest, NextResponse } from "next/server";
import { getAllShows, getShowsCount, getTopShowsForWeek, getMostDiscussedForWeek, getLatestWeek, getStats, getIgnoredShows } from "@/lib/db";
import { startScheduler } from "@/lib/scheduler";

// Start the cron scheduler when the API is first loaded
startScheduler();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get("sort") || "score";
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");
    const week = searchParams.get("week");
    const view = searchParams.get("view");

    if (view === "trending" && week) {
      const shows = getTopShowsForWeek(week, limit);
      return NextResponse.json({ shows });
    }

    if (view === "discussed" && week) {
      const shows = getMostDiscussedForWeek(week, limit);
      return NextResponse.json({ shows });
    }

    if (view === "ignored") {
      const shows = getIgnoredShows(limit);
      return NextResponse.json({ shows });
    }

    const includeHidden = searchParams.get("includeHidden") === "true";
    const shows = getAllShows(sort, limit, offset, includeHidden);
    const total = getShowsCount();
    const latestWeek = getLatestWeek();
    const stats = getStats();

    return NextResponse.json({ shows, total, latestWeek, stats });
  } catch (err) {
    console.error("GET /api/shows error:", err);
    return NextResponse.json({ error: "Failed to fetch shows" }, { status: 500 });
  }
}
