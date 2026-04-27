import { NextResponse } from "next/server";
import { extractShows } from "@/lib/show-matcher";
import { analyzeSentiment } from "@/lib/sentiment";
import { clearCache } from "@/lib/tvdb";
import {
  getAllStoredComments,
  clearShowsAndMentions,
  getShowByName,
  insertShow,
  insertMention,
  updateShowLastSeen,
  incrementShowMentions,
  type ShowRow,
} from "@/lib/db";

export const maxDuration = 300;

export async function POST() {
  try {
    // 1. Extract all stored comments before clearing
    const storedComments = getAllStoredComments();

    if (storedComments.length === 0) {
      return NextResponse.json({
        result: {
          commentsProcessed: 0,
          showsFound: 0,
          mentionsCreated: 0,
          errors: ["No stored comments to re-analyze"],
        },
      });
    }

    // 2. Clear shows and mentions (threads are preserved)
    clearShowsAndMentions();
    clearCache();

    // 3. Re-process each comment with the updated matcher
    let showsFound = 0;
    let mentionsCreated = 0;
    const errors: string[] = [];
    const showsSeen = new Set<string>();

    for (const comment of storedComments) {
      try {
        const matches = await extractShows(comment.comment_body);
        const sentiment = analyzeSentiment(comment.comment_body);

        for (const match of matches) {
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
              first_seen: comment.week_of,
              last_seen: comment.week_of,
              total_mentions: 0,
            } as Omit<ShowRow, "id">);
            show = getShowByName(match.name);
            if (!showsSeen.has(match.name.toLowerCase())) {
              showsFound++;
              showsSeen.add(match.name.toLowerCase());
            }
          }

          if (show) {
            const mentionResult = insertMention({
              show_id: show.id,
              thread_id: comment.thread_id,
              comment_reddit_id: comment.comment_reddit_id,
              comment_body: comment.comment_body,
              sentiment_score: sentiment.score,
              raw_sentiment: sentiment.raw,
              created_at: comment.created_at,
            });

            if (mentionResult.changes > 0) {
              mentionsCreated++;
              incrementShowMentions(show.id);
              updateShowLastSeen(show.id, comment.week_of);
            }
          }
        }
      } catch (err) {
        errors.push(`Comment ${comment.comment_reddit_id}: ${err}`);
      }
    }

    return NextResponse.json({
      result: {
        commentsProcessed: storedComments.length,
        showsFound,
        mentionsCreated,
        errors,
      },
    });
  } catch (err) {
    console.error("POST /api/reanalyze error:", err);
    return NextResponse.json(
      { error: `Re-analysis failed: ${err}` },
      { status: 500 }
    );
  }
}
