import { NextResponse } from "next/server";
import { scrapeLatestThread } from "@/lib/scraper";

export const maxDuration = 300; // Allow up to 5 minutes

export async function POST() {
  try {
    const result = await scrapeLatestThread();
    return NextResponse.json({ result });
  } catch (err) {
    console.error("POST /api/scrape error:", err);
    return NextResponse.json(
      { error: `Scrape failed: ${err}` },
      { status: 500 }
    );
  }
}
