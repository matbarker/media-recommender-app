/**
 * Main scraper orchestrator.
 * Fetches Reddit threads, extracts shows, scores sentiment, stores results.
 */

import { findWeeklyThreads, fetchTopLevelComments, extractWeekDate } from "./reddit";
import { extractShows } from "./show-matcher";
import { analyzeSentiment } from "./sentiment";
import { clearCache } from "./tvdb";
import {
  getThread,
  insertThread,
  getShowByName,
  insertShow,
  updateShowLastSeen,
  incrementShowMentions,
  insertMention,
  type ShowRow,
} from "./db";

export interface ScrapeResult {
  threadTitle: string;
  weekOf: string;
  commentsProcessed: number;
  showsFound: number;
  mentionsCreated: number;
  errors: string[];
  skipped: boolean;
}

/**
 * Scrape the most recent weekly thread.
 */
export async function scrapeLatestThread(): Promise<ScrapeResult> {
  const threads = await findWeeklyThreads(1);
  if (threads.length === 0) {
    return {
      threadTitle: "",
      weekOf: "",
      commentsProcessed: 0,
      showsFound: 0,
      mentionsCreated: 0,
      errors: ["No weekly thread found"],
      skipped: true,
    };
  }

  return scrapeThread(threads[0].id, threads[0].title, threads[0].url, threads[0].num_comments);
}

/**
 * Backfill: scrape the N most recent weekly threads.
 */
export async function backfillThreads(count: number): Promise<ScrapeResult[]> {
  const threads = await findWeeklyThreads(count);
  const results: ScrapeResult[] = [];

  for (const thread of threads) {
    const result = await scrapeThread(thread.id, thread.title, thread.url, thread.num_comments);
    results.push(result);
    // Small delay between threads to respect rate limits
    await new Promise((r) => setTimeout(r, 2000));
  }

  return results;
}

async function scrapeThread(
  redditId: string,
  title: string,
  url: string,
  numComments: number
): Promise<ScrapeResult> {
  const weekOf = extractWeekDate(title);
  const errors: string[] = [];

  // Check if already scraped
  const existing = getThread(redditId);
  if (existing) {
    return {
      threadTitle: title,
      weekOf,
      commentsProcessed: 0,
      showsFound: 0,
      mentionsCreated: 0,
      errors: [],
      skipped: true,
    };
  }

  // Insert thread record
  const threadResult = insertThread({
    reddit_id: redditId,
    title,
    url,
    week_of: weekOf,
    scraped_at: new Date().toISOString(),
    comment_count: numComments,
  });

  const threadId = Number(threadResult.lastInsertRowid);
  if (!threadId) {
    return {
      threadTitle: title,
      weekOf,
      commentsProcessed: 0,
      showsFound: 0,
      mentionsCreated: 0,
      errors: ["Failed to insert thread record"],
      skipped: false,
    };
  }

  // Clear TVDB cache for fresh lookups
  clearCache();

  // Fetch comments
  let comments;
  try {
    comments = await fetchTopLevelComments(redditId);
  } catch (err) {
    errors.push(`Failed to fetch comments: ${err}`);
    return {
      threadTitle: title,
      weekOf,
      commentsProcessed: 0,
      showsFound: 0,
      mentionsCreated: 0,
      errors,
      skipped: false,
    };
  }

  let showsFound = 0;
  let mentionsCreated = 0;
  const showsSeen = new Set<string>();

  for (const comment of comments) {
    try {
      const matches = await extractShows(comment.body);
      const sentiment = analyzeSentiment(comment.body);

      for (const match of matches) {
        // Ensure show exists in DB
        let show = getShowByName(match.name);
        if (!show) {
          const tvdb = match.tvdbData;
          insertShow({
            name: match.name,
            tvdb_id: tvdb?.tvdb_id || null,
            tvdb_slug: tvdb?.slug || null,
            tvdb_image_url: tvdb?.image_url || null,
            tvdb_year: tvdb?.year || null,
            tvdb_network: tvdb?.network || null,
            tvdb_status: tvdb?.status || null,
            tvdb_overview: tvdb?.overview || null,
            first_seen: weekOf,
            last_seen: weekOf,
            total_mentions: 0,
          } as Omit<ShowRow, "id">);
          show = getShowByName(match.name);
          if (!showsSeen.has(match.name.toLowerCase())) {
            showsFound++;
            showsSeen.add(match.name.toLowerCase());
          }
        }

        if (show) {
          // Insert mention
          const mentionResult = insertMention({
            show_id: show.id,
            thread_id: threadId,
            comment_reddit_id: comment.id,
            comment_body: comment.body.substring(0, 2000), // Truncate very long comments
            sentiment_score: sentiment.score,
            raw_sentiment: sentiment.raw,
            created_at: new Date(comment.created_utc * 1000).toISOString(),
          });

          if (mentionResult.changes > 0) {
            mentionsCreated++;
            incrementShowMentions(show.id);
            updateShowLastSeen(show.id, weekOf);
          }
        }
      }
    } catch (err) {
      errors.push(`Comment ${comment.id}: ${err}`);
    }
  }

  return {
    threadTitle: title,
    weekOf,
    commentsProcessed: comments.length,
    showsFound,
    mentionsCreated,
    errors,
    skipped: false,
  };
}
