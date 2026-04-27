/**
 * TheTVDB API v4 interaction module.
 * Used to verify that extracted show names are real TV series.
 */

export interface TVDBShow {
  tvdb_id: number;
  name: string;
  slug: string;
  image_url: string | null;
  year: string | null;
  network: string | null;
  status: string | null;
  overview: string | null;
}

let bearerToken: string | null = null;
let tokenExpiry = 0;

// In-memory cache to avoid re-querying for shows already looked up
const searchCache = new Map<string, TVDBShow | null>();

// Networks to exclude from matching (YouTube originals, web series, etc.)
const EXCLUDED_NETWORKS = new Set([
  "youtube", "youtube premium", "youtube originals", "youtube red",
]);

async function authenticate(): Promise<string> {
  if (bearerToken && Date.now() < tokenExpiry) {
    return bearerToken;
  }

  const apiKey = process.env.TVDB_API_KEY;
  if (!apiKey) {
    throw new Error("Missing TVDB_API_KEY environment variable");
  }

  const res = await fetch("https://api4.thetvdb.com/v4/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey }),
  });

  if (!res.ok) {
    throw new Error(`TVDB auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  bearerToken = data.data.token;
  // Token is valid for ~30 days, refresh after 24h to be safe
  tokenExpiry = Date.now() + 24 * 60 * 60 * 1000;
  return bearerToken!;
}

/**
 * Search for a TV show by name.
 * Returns the best match if the name closely matches, or null if no good match.
 */
export async function searchShow(name: string): Promise<TVDBShow | null> {
  const cacheKey = name.toLowerCase().trim();
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  try {
    const token = await authenticate();
    const query = encodeURIComponent(name);
    const res = await fetch(
      `https://api4.thetvdb.com/v4/search?query=${query}&type=series&limit=5`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      if (res.status === 404) {
        searchCache.set(cacheKey, null);
        return null;
      }
      throw new Error(`TVDB search failed: ${res.status}`);
    }

    const data = await res.json();
    const allResults = data.data as Record<string, unknown>[];

    if (!allResults || allResults.length === 0) {
      searchCache.set(cacheKey, null);
      return null;
    }

    // Filter out YouTube shows
    const results = allResults.filter((r) => {
      const network = ((r.network as string) || "").toLowerCase().trim();
      return !EXCLUDED_NETWORKS.has(network);
    });

    if (results.length === 0) {
      searchCache.set(cacheKey, null);
      return null;
    }

    // Find the best match — prefer exact name match (case-insensitive)
    const exactMatch = results.find(
      (r) => (r.name as string)?.toLowerCase() === cacheKey ||
             (r.aliases as string[])?.some((a: string) => a.toLowerCase() === cacheKey)
    );

    const best = exactMatch || results[0];

    // Only accept if the name is reasonably close
    const resultName = (best.name as string) || "";
    if (!isCloseMatch(name, resultName)) {
      searchCache.set(cacheKey, null);
      return null;
    }

    const show: TVDBShow = {
      tvdb_id: parseInt(best.tvdb_id as string) || (best.id as number) || 0,
      name: resultName,
      slug: (best.slug as string) || "",
      image_url: (best.image_url as string) || (best.thumbnail as string) || null,
      year: (best.year as string) || null,
      network: (best.network as string) || (best.primary_language as string) || null,
      status: (best.status as string) || null,
      overview: truncateOverview((best.overview as string) || ((best.overviews as Record<string, string>)?.eng as string) || null),
    };

    // Final safety check: reject if network resolved to YouTube
    if (show.network && EXCLUDED_NETWORKS.has(show.network.toLowerCase().trim())) {
      searchCache.set(cacheKey, null);
      return null;
    }

    searchCache.set(cacheKey, show);
    return show;
  } catch (err) {
    console.warn(`TVDB search error for "${name}":`, err);
    searchCache.set(cacheKey, null);
    return null;
  }
}

/**
 * Check if two show names match closely enough.
 * Uses normalized comparison — handles "The" prefix, punctuation, etc.
 */
function isCloseMatch(query: string, result: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase()
      .replace(/^the\s+/, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const a = normalize(query);
  const b = normalize(result);

  // Exact match after normalization
  if (a === b) return true;

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;

  // Simple Levenshtein-like check: allow up to 2 character differences for short names
  if (a.length <= 5 && b.length <= 5) {
    return levenshtein(a, b) <= 1;
  }

  return levenshtein(a, b) <= 2;
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function truncateOverview(text: string | null): string | null {
  if (!text) return null;
  if (text.length <= 300) return text;
  return text.substring(0, 297) + "...";
}

/**
 * Clear the search cache (useful between scrape runs if needed)
 */
export function clearCache() {
  searchCache.clear();
}
