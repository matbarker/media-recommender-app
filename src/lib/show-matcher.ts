/**
 * TV show identification from Reddit comment text.
 * Two-pass hybrid approach:
 * 1. Dictionary lookup against known shows in the database
 * 2. Heuristic extraction + TheTVDB verification for new shows
 */

import { getDb, getSetting } from "./db";
import { searchShow as searchShowTVDB, type TVDBShow } from "./tvdb";
import { searchShowSonarr } from "./sonarr";

export interface MatchedShow {
  name: string;
  tvdbData: TVDBShow | null;
}

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

    if (tvdbResult) {
      seen.add(candidateLower);
      matches.push({ name: tvdbResult.name, tvdbData: tvdbResult });
    }
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
 * Extract candidate show names from comment text using heuristics.
 */
function extractCandidates(text: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (name: string) => {
    const cleaned = name.trim().replace(/[.,!?;:'"()[\]{}]+$/g, "").replace(/^[.,!?;:'"()[\]{}]+/g, "").trim();
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

  // 3. Quoted text
  const quoteMatches = text.matchAll(/"([^"]+?)"|"([^"]+?)"|'([^']+?)'/g);
  for (const m of quoteMatches) {
    addCandidate(m[1] || m[2] || m[3]);
  }

  // 4. "Watching X" / "Started X" / "Finished X" / "Binged X" patterns
  const verbPatterns = text.matchAll(
    /(?:watching|started|finished|binged|loving|enjoying|recommend|recommending|discovered|checking out|tried|trying)\s+([A-Z][A-Za-z0-9':&\- ]{1,50}?)(?:\s*[-–—.!,;]|\s+and\s|\s+on\s|\s+is\s|\s+was\s|\s+has\s|\s+it\s|\s+which\s|\s+because\s|\s+but\s|\s+though\s|\s+after\s|$)/gi
  );
  for (const m of verbPatterns) {
    if (m[1]) {
      // Clean trailing common words
      let name = m[1].replace(/\s+(and|on|is|was|has|it|the|this|that|so|but|because|which|after|before|since|if|or|yet|for|with|really|very|lately|recently|again|too)$/i, "").trim();
      if (name.length >= 2) {
        addCandidate(name);
      }
    }
  }

  // 5. Title Case phrases (2+ consecutive capitalized words)
  const titleCaseMatches = text.matchAll(
    /\b([A-Z][a-z]+(?:\s+(?:the|of|and|in|on|at|to|for|a|an|is|The|Of|And|In|On|At|To|For|A|An|Is)\s+)?(?:[A-Z][a-z]+)(?:\s+(?:the|of|and|in|on|at|to|for|a|an|The|Of|And|In|On|At|To|For|A|An)\s+[A-Z][a-z]+)*)\b/g
  );
  for (const m of titleCaseMatches) {
    if (m[1] && m[1].split(/\s+/).length >= 2 && m[1].split(/\s+/).length <= MAX_NAME_WORDS) {
      addCandidate(m[1]);
    }
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
