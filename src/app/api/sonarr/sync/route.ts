import { NextResponse } from "next/server";
import { getSetting, getDb, syncSonarrLibrary } from "@/lib/db";
import { getAllSeries } from "@/lib/sonarr";

export async function POST() {
  try {
    const url = getSetting("sonarr_url");
    const apiKey = getSetting("sonarr_api_key");
    if (!url || !apiKey) return NextResponse.json({ error: "Sonarr not configured" }, { status: 400 });

    const series = await getAllSeries(url, apiKey);
    const existingTvdbIds = series.map((s: any) => s.tvdbId).filter(Boolean);

    // Mark shows in our DB
    const db = getDb();
    
    // Sync the separate cache table
    const libraryCache = series.map((s: any) => ({ tvdb_id: s.tvdbId, title: s.title })).filter((s:any) => s.tvdb_id);
    syncSonarrLibrary(libraryCache);

    const stmt = db.prepare("UPDATE shows SET in_sonarr = 1 WHERE tvdb_id = ?");
    const tx = db.transaction(() => {
      for (const id of existingTvdbIds) {
        stmt.run(id);
      }
    });
    tx();

    return NextResponse.json({ success: true, count: existingTvdbIds.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
