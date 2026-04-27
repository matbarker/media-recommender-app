/**
 * TV show identification from Reddit comment text.
 * Two-pass hybrid approach:
 * 1. Dictionary lookup against known shows in the database
 * 2. Heuristic extraction + TheTVDB verification for new shows
 */

import { getDb, getSetting } from "./db";
import { searchShowSonarr } from "./sonarr";
import { searchShow as searchShowTVDB, type TVDBShow } from "./tvdb";

export interface MatchedShow {
  name: string;
  tvdbData: TVDBShow | null;
}

// Global cache for candidates to severely speed up backfills
const resolutionCache = new Map<string, TVDBShow | null>();

// Common words that should NOT be treated as show names
const STOP_WORDS = new Set([
  "the", "a", "an", "i", "we", "you", "he", "she", "it", "they", "my", "our",
  "this", "that", "what", "which", "who", "how", "when", "where", "why",
  "just", "really", "very", "also", "been", "have", "has", "had", "was",
  "were", "are", "is", "will", "would", "could", "should", "may", "might",
  "not", "but", "and", "or", "so", "yet", "for", "with", "about", "into",
  "from", "over", "after", "before", "between", "under", "above", "all",
  "each", "every", "both", "few", "more", "most", "some", "any", "no",
  "yes", "ok", "okay", "lol", "lmao", "imo", "imho", "tbh", "edit",
  "season", "episode", "series", "show", "watch", "watching", "watched",
  "started", "finished", "binged", "recommend", "recommended", "love",
  "loved", "great", "good", "bad", "best", "worst", "amazing", "awesome",
  "terrible", "horrible", "netflix", "hbo", "hulu", "disney", "amazon",
  "prime", "apple", "peacock", "paramount", "max", "fx", "amc", "abc",
  "nbc", "cbs", "bbc", "cw", "usa", "tnt", "tbs", "syfy",
  "tv", "new", "old", "last", "next", "first", "second", "third",
  "much", "many", "well", "even", "still", "though", "already", "enough",
  "back", "now", "then", "here", "there", "never", "always", "sometimes",
  "everyone", "no one", "anyone", "someone", "something", "everything",
  "nothing", "anything", "myself", "himself", "herself", "itself",
  "acting", "actor", "actress", "plot", "story", "character", "characters",
  "finale", "premiere", "pilot", "ending", "beginning", "spoiler", "spoilers",
  "holy shit", "omg", "wow", "damn", "god", "jesus", "please", "thanks",
  "thank you", "sorry", "help", "question", "opinion", "thoughts",
  "currently", "finally", "recently", "actually", "honestly", "literally",
  "definitely", "probably", "maybe", "basically", "especially",
]);

// Minimum and maximum word count for show name candidates
const MIN_NAME_WORDS = 1;
const MAX_NAME_WORDS = 6;

/**
 * Extract TV show mentions from a comment.
 * Returns a list of matched shows with their TVDB data (if found).
 */
export async function extractShows(commentBody: string): Promise<MatchedShow[]> {
  const matches: MatchedShow[] = [];
  const seen = new Set<string>();

  // Pass 1: Check against known shows in the database
  const knownShows = getKnownShowNames();
  for (const showName of knownShows) {
    const lower = commentBody.toLowerCase();
    const showLower = showName.toLowerCase();
    if (lower.includes(showLower)) {
      if (!seen.has(showLower)) {
        seen.add(showLower);
        matches.push({ name: showName, tvdbData: null });
      }
    }
  }

  // Pass 2: Extract candidates using heuristics, then verify with Sonarr/TVDB
  const candidates = extractCandidates(commentBody);
  
  // Pre-fetch settings to avoid querying per candidate
  const sonarrUrl = getSetting("sonarr_url");
  const sonarrApiKey = getSetting("sonarr_api_key");

  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();
    if (seen.has(candidateLower)) continue;

    let tvdbResult = null;

    // Check memory cache first to save network calls
    if (resolutionCache.has(candidateLower)) {
      tvdbResult = resolutionCache.get(candidateLower)!;
    } else {
      // Fallback Resolver: Try Sonarr first, then TVDB
      if (sonarrUrl && sonarrApiKey) {
        try {
          tvdbResult = await searchShowSonarr(sonarrUrl, sonarrApiKey, candidate);
        } catch (err) {
          console.warn(`Sonarr lookup failed for "${candidate}", falling back to TVDB...`, err);
        }
      }

      if (!tvdbResult) {
         tvdbResult = await searchShowTVDB(candidate);
      }
      
      resolutionCache.set(candidateLower, tvdbResult);
    }

    if (tvdbResult) {
      seen.add(candidateLower);
      matches.push({ name: tvdbResult.name, tvdbData: tvdbResult });
    }
  }

  // Cap cache size to prevent unbounded memory growth during huge backfills
  if (resolutionCache.size > 10000) {
    const keys = Array.from(resolutionCache.keys());
    for (let i = 0; i < 5000; i++) resolutionCache.delete(keys[i]);
  }

  return matches;
}

/**
 * Get all known show names from the database.
 */
function getKnownShowNames(): string[] {
  try {
    const rows = getDb()
      .prepare("SELECT name FROM shows")
      .all() as { name: string }[];
    return rows.map((r) => r.name);
  } catch {
    return [];
  }
}

/**
 * Extract candidate show names from comment text.
 * Only extracts from explicit formatting (bold/italic) to avoid false positives.
 * In r/television weekly threads, users typically bold show names like **The Americans**.
 */
function extractCandidates(text: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (name: string) => {
    const cleaned = name.trim().replace(/[.,!?;:'"()\[\]{}]+$/g, "").replace(/^[.,!?;:'"()\[\]{}]+/g, "").trim();
    if (cleaned.length < 2 || cleaned.length > 80) return;
    const lower = cleaned.toLowerCase();
    if (seen.has(lower)) return;
    if (isStopWord(lower)) return;
    seen.add(lower);
    candidates.push(cleaned);
  };

  // 1. Bold text: **Show Name** or __Show Name__
  const boldMatches = text.matchAll(/\*\*(.+?)\*\*|__(.+?)__/g);
  for (const m of boldMatches) {
    addCandidate(m[1] || m[2]);
  }

  // 2. Italic text: *Show Name* or _Show Name_
  const italicMatches = text.matchAll(/(?<!\*)\*([^*]+?)\*(?!\*)|(?<!_)_([^_]+?)_(?!_)/g);
  for (const m of italicMatches) {
    addCandidate(m[1] || m[2]);
  }

  return candidates;
}

function isStopWord(text: string): boolean {
  const words = text.split(/\s+/);
  // Single word that's a stop word
  if (words.length === 1 && STOP_WORDS.has(text)) return true;
  // All words are stop words
  if (words.every((w) => STOP_WORDS.has(w))) return true;
  return false;
}
