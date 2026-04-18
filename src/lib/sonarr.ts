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
