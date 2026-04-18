import { NextResponse } from "next/server";
import { getSetting, setSetting } from "@/lib/db";

export async function GET() {
  return NextResponse.json({
    sonarrUrl: getSetting("sonarr_url"),
    sonarrApiKey: getSetting("sonarr_api_key"),
    qualityProfileId: getSetting("sonarr_quality_profile"),
    languageProfileId: getSetting("sonarr_language_profile"),
    rootFolderPath: getSetting("sonarr_root_folder"),
  });
}

export async function POST(req: Request) {
  const data = await req.json();
  if (data.sonarrUrl !== undefined) setSetting("sonarr_url", data.sonarrUrl);
  if (data.sonarrApiKey !== undefined) setSetting("sonarr_api_key", data.sonarrApiKey);
  if (data.qualityProfileId !== undefined) setSetting("sonarr_quality_profile", data.qualityProfileId.toString());
  if (data.languageProfileId !== undefined) setSetting("sonarr_language_profile", data.languageProfileId.toString());
  if (data.rootFolderPath !== undefined) setSetting("sonarr_root_folder", data.rootFolderPath);
  
  return NextResponse.json({ success: true });
}
