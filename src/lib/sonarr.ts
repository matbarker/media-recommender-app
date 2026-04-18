import { getDb, getSetting, syncSonarrLibrary } from "./db";

export interface SonarrProfile {
  id: number;
  name: string;
}

export interface SonarrRootFolder {
  id: number;
  path: string;
}

function getBaseUrl(url: string) {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

export async function testConnection(url: string, apiKey: string) {
  const res = await fetch(`${getBaseUrl(url)}/api/v3/system/status?apikey=${apiKey}`);
  if (!res.ok) throw new Error("Connection failed");
  return res.json();
}

export async function getProfiles(url: string, apiKey: string): Promise<SonarrProfile[]> {
  const res = await fetch(`${getBaseUrl(url)}/api/v3/qualityprofile?apikey=${apiKey}`);
  if (!res.ok) throw new Error("Failed to fetch quality profiles");
  return res.json();
}

export async function getLanguageProfiles(url: string, apiKey: string): Promise<SonarrProfile[]> {
  const res = await fetch(`${getBaseUrl(url)}/api/v3/languageprofile?apikey=${apiKey}`);
  if (!res.ok) throw new Error("Failed to fetch language profiles");
  return res.json();
}

export async function getRootFolders(url: string, apiKey: string): Promise<SonarrRootFolder[]> {
  const res = await fetch(`${getBaseUrl(url)}/api/v3/rootfolder?apikey=${apiKey}`);
  if (!res.ok) throw new Error("Failed to fetch root folders");
  return res.json();
}

export async function getAllSeries(url: string, apiKey: string) {
  const res = await fetch(`${getBaseUrl(url)}/api/v3/series?apikey=${apiKey}`);
  if (!res.ok) throw new Error("Failed to fetch series");
  return res.json() as Promise<any[]>;
}

export async function addSeries(
  url: string, 
  apiKey: string, 
  tvdbId: number, 
  qualityProfileId: number, 
  languageProfileId: number, 
  rootFolderPath: string
) {
  // Look up the series from Sonarr's perspective using TVDB ID
  const searchRes = await fetch(`${getBaseUrl(url)}/api/v3/series/lookup?term=tvdb:${tvdbId}&apikey=${apiKey}`);
  if (!searchRes.ok) throw new Error("Failed to lookup series on Sonarr");
  const searchData = await searchRes.json();
  if (!searchData || searchData.length === 0) throw new Error("Series not found on Sonarr");
  
  const series = searchData[0];
  
  // Post back to add it
  const addRes = await fetch(`${getBaseUrl(url)}/api/v3/series?apikey=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...series,
      qualityProfileId,
      languageProfileId,
      rootFolderPath,
      monitored: true,
      addOptions: {
        monitor: "all",
        searchForMissingEpisodes: true
      }
    })
  });
  
  if (!addRes.ok) {
    const errorBody = await addRes.text();
    throw new Error(`Failed to add series: ${errorBody}`);
  }
  return addRes.json();
}

export async function executeSonarrSync() {
  const url = getSetting("sonarr_url");
  const apiKey = getSetting("sonarr_api_key");
  if (!url || !apiKey) return { count: 0, error: "Sonarr not configured" };

  const series = await getAllSeries(url, apiKey);
  const existingTvdbIds = series.map((s: any) => s.tvdbId).filter(Boolean);

  const libraryCache = series.map((s: any) => ({ tvdb_id: s.tvdbId, title: s.title })).filter((s:any) => s.tvdb_id);
  syncSonarrLibrary(libraryCache);

  const db = getDb();
  const stmt = db.prepare("UPDATE shows SET in_sonarr = 1 WHERE tvdb_id = ?");
  const tx = db.transaction(() => {
    for (const id of existingTvdbIds) {
      stmt.run(id);
    }
  });
  tx();

  return { count: existingTvdbIds.length };
}

/**
 * Searches Sonarr for a show by name.
 * Uses Sonarr's Skyhook lookup which returns TVDB mapped objects.
 */
export async function searchShowSonarr(url: string, apiKey: string, name: string) {
  const query = encodeURIComponent(name);
  const res = await fetch(`${getBaseUrl(url)}/api/v3/series/lookup?term=${query}&apikey=${apiKey}`);
  
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Sonarr lookup failed: ${res.status}`);
  }

  const results = await res.json();
  if (!results || results.length === 0) return null;

  // Find best match similar to how TVDB does it
  const cacheKey = name.toLowerCase().trim();
  const exactMatch = results.find(
    (r: any) => r.title?.toLowerCase() === cacheKey
  );

  const best = exactMatch || results[0];

  // Map to our standard TVDBShow interface format
  return {
    tvdb_id: best.tvdbId || 0,
    name: best.title || "",
    slug: best.titleSlug || "",
    image_url: best.remotePoster || best.images?.[0]?.url || null,
    year: best.year ? best.year.toString() : null,
    network: best.network || null,
    status: best.status || null,
    overview: best.overview || null,
  };
}
