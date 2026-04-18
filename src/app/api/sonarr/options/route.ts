import { NextResponse } from "next/server";
import { getProfiles, getLanguageProfiles, getRootFolders } from "@/lib/sonarr";

export async function POST(req: Request) {
  try {
    const { url, apiKey } = await req.json();
    if (!url || !apiKey) {
      return NextResponse.json({ error: "URL and API Key are required to fetch options" }, { status: 400 });
    }

    const [qualityProfiles, languageProfiles, rootFolders] = await Promise.all([
      getProfiles(url, apiKey),
      getLanguageProfiles(url, apiKey),
      getRootFolders(url, apiKey),
    ]);

    return NextResponse.json({
      qualityProfiles: qualityProfiles.map(p => ({ id: p.id, name: p.name })),
      languageProfiles: languageProfiles.map(p => ({ id: p.id, name: p.name })),
      rootFolders: rootFolders.map(f => ({ id: f.id, path: f.path })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
