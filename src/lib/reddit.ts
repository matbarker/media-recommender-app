/**
 * Reddit API interaction module.
 * Uses the Reddit JSON API (appending .json) with OAuth for authentication.
 */

interface RedditComment {
  id: string;
  body: string;
  author: string;
  score: number;
  created_utc: number;
}

interface RedditThread {
  id: string;
  title: string;
  url: string;
  created_utc: number;
  num_comments: number;
}

let accessToken: string | null = null;
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  const userAgent = process.env.REDDIT_USER_AGENT || "media-recommender-app/1.0";

  if (!clientId || !clientSecret) {
    throw new Error("Missing REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET environment variables");
  }

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // Refresh 60s early
  return accessToken!;
}

async function redditGet(endpoint: string): Promise<unknown> {
  const token = await getAccessToken();
  const userAgent = process.env.REDDIT_USER_AGENT || "media-recommender-app/1.0";

  const res = await fetch(`https://oauth.reddit.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent,
    },
  });

  if (!res.ok) {
    throw new Error(`Reddit API error: ${res.status} ${res.statusText} for ${endpoint}`);
  }

  return res.json();
}

/**
 * Finds weekly "What are you watching" threads from r/television.
 * Returns the most recent N threads.
 */
export async function findWeeklyThreads(count: number = 1): Promise<RedditThread[]> {
  // Search by flair
  const data = await redditGet(
    `/r/television/search?q=flair%3A%22Weekly+Rec+Thread%22&restrict_sr=true&sort=new&limit=${count}&type=link`
  ) as { data: { children: { data: Record<string, unknown> }[] } };

  return data.data.children.map((child) => ({
    id: child.data.id as string,
    title: child.data.title as string,
    url: `https://www.reddit.com${child.data.permalink as string}`,
    created_utc: child.data.created_utc as number,
    num_comments: child.data.num_comments as number,
  }));
}

/**
 * Fetches all top-level comments from a thread.
 * Handles pagination via "more" objects.
 */
export async function fetchTopLevelComments(threadId: string): Promise<RedditComment[]> {
  const comments: RedditComment[] = [];

  // Fetch the thread with comments
  const data = await redditGet(
    `/r/television/comments/${threadId}?sort=confidence&limit=500`
  ) as unknown[];

  // data[1] contains the comment listing
  const commentListing = data[1] as { data: { children: { kind: string; data: Record<string, unknown> }[] } };

  for (const child of commentListing.data.children) {
    if (child.kind === "t1") {
      const c = child.data;
      // Skip deleted/removed comments
      if (c.body === "[deleted]" || c.body === "[removed]") continue;
      // Skip AutoModerator
      if (c.author === "AutoModerator") continue;

      comments.push({
        id: c.id as string,
        body: c.body as string,
        author: c.author as string,
        score: c.score as number,
        created_utc: c.created_utc as number,
      });
    }
  }

  // Try to load "more" comments if present
  const moreChildren = commentListing.data.children.find((c) => c.kind === "more");
  if (moreChildren) {
    const moreIds = (moreChildren.data.children as string[]).slice(0, 100); // Limit to 100 "more" IDs at a time
    if (moreIds.length > 0) {
      try {
        const moreComments = await loadMoreComments(threadId, moreIds);
        comments.push(...moreComments);
      } catch (err) {
        console.warn("Failed to load more comments:", err);
      }
    }
  }

  return comments;
}

async function loadMoreComments(threadId: string, ids: string[]): Promise<RedditComment[]> {
  const token = await getAccessToken();
  const userAgent = process.env.REDDIT_USER_AGENT || "media-recommender-app/1.0";

  const body = new URLSearchParams({
    api_type: "json",
    link_id: `t3_${threadId}`,
    children: ids.join(","),
    sort: "confidence",
  });

  const res = await fetch("https://oauth.reddit.com/api/morechildren", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": userAgent,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`morechildren failed: ${res.status}`);
  }

  const data = await res.json();
  const comments: RedditComment[] = [];

  if (data.json?.data?.things) {
    for (const thing of data.json.data.things) {
      if (thing.kind === "t1") {
        const c = thing.data;
        if (c.body === "[deleted]" || c.body === "[removed]") continue;
        if (c.author === "AutoModerator") continue;
        // Only take top-level comments (parent is the thread itself)
        if (c.parent_id === `t3_${threadId}`) {
          comments.push({
            id: c.id,
            body: c.body,
            author: c.author,
            score: c.score,
            created_utc: c.created_utc,
          });
        }
      }
    }
  }

  return comments;
}

/**
 * Extracts the "Week of ..." date from a thread title.
 * e.g. "What are you watching and what do you recommend? (Week of April 10, 2026)" → "2026-04-10"
 */
export function extractWeekDate(title: string): string {
  const match = title.match(/Week of (\w+ \d+,?\s*\d{4})/i);
  if (match) {
    const d = new Date(match[1]);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  }
  // Fallback: use current date
  return new Date().toISOString().split("T")[0];
}
