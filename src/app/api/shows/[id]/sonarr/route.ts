import { NextResponse } from "next/server";
import { getSetting, getShowById, markShowInSonarr } from "@/lib/db";
import { addSeries } from "@/lib/sonarr";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const showId = parseInt(id, 10);
    const show = getShowById(showId);
    
    if (!show) return NextResponse.json({ error: "Show not found" }, { status: 404 });
    if (!show.tvdb_id) return NextResponse.json({ error: "Show has no TVDB ID" }, { status: 400 });

    const url = getSetting("sonarr_url");
    const apiKey = getSetting("sonarr_api_key");
    const qualityProfileId = getSetting("sonarr_quality_profile");
    const languageProfileId = getSetting("sonarr_language_profile");
    const rootFolderPath = getSetting("sonarr_root_folder");

    if (!url || !apiKey || !qualityProfileId || !languageProfileId || !rootFolderPath) {
      return NextResponse.json({ error: "Sonarr is not fully configured" }, { status: 400 });
    }

    await addSeries(
      url, apiKey, 
      show.tvdb_id, 
      parseInt(qualityProfileId, 10), 
      parseInt(languageProfileId, 10), 
      rootFolderPath
    );

    markShowInSonarr(showId, true);
    
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
