import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH || "./data/data.db";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  // Ensure directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reddit_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      week_of TEXT NOT NULL,
      scraped_at TEXT NOT NULL,
      comment_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      tvdb_id INTEGER,
      tvdb_slug TEXT,
      tvdb_image_url TEXT,
      tvdb_year TEXT,
      tvdb_network TEXT,
      tvdb_status TEXT,
      tvdb_overview TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      total_mentions INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS mentions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      show_id INTEGER NOT NULL REFERENCES shows(id),
      thread_id INTEGER NOT NULL REFERENCES threads(id),
      comment_reddit_id TEXT NOT NULL,
      comment_body TEXT NOT NULL,
      sentiment_score REAL NOT NULL,
      raw_sentiment REAL NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(show_id, comment_reddit_id)
    );

    CREATE INDEX IF NOT EXISTS idx_mentions_show ON mentions(show_id);
    CREATE INDEX IF NOT EXISTS idx_mentions_thread ON mentions(thread_id);
    CREATE INDEX IF NOT EXISTS idx_shows_name ON shows(name);

    CREATE TABLE IF NOT EXISTS sonarr_library (
      tvdb_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const columns = db.pragma("table_info(shows)") as { name: string }[];
  if (!columns.find(c => c.name === "hidden")) {
    db.exec("ALTER TABLE shows ADD COLUMN hidden INTEGER DEFAULT 0");
  }
  if (!columns.find(c => c.name === "in_sonarr")) {
    db.exec("ALTER TABLE shows ADD COLUMN in_sonarr INTEGER DEFAULT 0");
  }
}

// ── Settings helpers ──

export function getSetting(key: string): string | null {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value || null;
}

export function setSetting(key: string, value: string) {
  getDb().prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// ── Sonarr Library helpers ──

export function syncSonarrLibrary(library: {tvdb_id: number, title: string}[]) {
  const db = getDb();
  db.prepare("DELETE FROM sonarr_library").run();
  const stmt = db.prepare("INSERT OR IGNORE INTO sonarr_library (tvdb_id, title) VALUES (?, ?)");
  const tx = db.transaction(() => {
    for (const show of library) {
      if (show.tvdb_id) stmt.run(show.tvdb_id, show.title);
    }
  });
  tx();
}

export function checkInSonarrLibrary(tvdbId: number): boolean {
  const row = getDb().prepare("SELECT 1 FROM sonarr_library WHERE tvdb_id = ?").get(tvdbId);
  return !!row;
}

// ── Thread helpers ──

export function getThread(redditId: string) {
  return getDb().prepare("SELECT * FROM threads WHERE reddit_id = ?").get(redditId) as ThreadRow | undefined;
}

export function insertThread(thread: Omit<ThreadRow, "id">) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO threads (reddit_id, title, url, week_of, scraped_at, comment_count)
    VALUES (@reddit_id, @title, @url, @week_of, @scraped_at, @comment_count)
  `).run(thread);
}

export function getAllThreads() {
  return getDb().prepare("SELECT * FROM threads ORDER BY week_of DESC").all() as ThreadRow[];
}

// ── Show helpers ──

export function getShowByName(name: string) {
  return getDb().prepare("SELECT * FROM shows WHERE name = ? COLLATE NOCASE").get(name) as ShowRow | undefined;
}

export function getShowById(id: number) {
  return getDb().prepare("SELECT * FROM shows WHERE id = ?").get(id) as ShowRow | undefined;
}

export function insertShow(show: Omit<ShowRow, "id">) {
  let inSonarr = show.in_sonarr || 0;
  if (!inSonarr && show.tvdb_id && checkInSonarrLibrary(show.tvdb_id)) {
    inSonarr = 1;
  }

  return getDb().prepare(`
    INSERT OR IGNORE INTO shows (name, tvdb_id, tvdb_slug, tvdb_image_url, tvdb_year, tvdb_network, tvdb_status, tvdb_overview, first_seen, last_seen, total_mentions, in_sonarr)
    VALUES (@name, @tvdb_id, @tvdb_slug, @tvdb_image_url, @tvdb_year, @tvdb_network, @tvdb_status, @tvdb_overview, @first_seen, @last_seen, @total_mentions, ${inSonarr})
  `).run(show);
}

export function updateShowLastSeen(id: number, lastSeen: string) {
  getDb().prepare("UPDATE shows SET last_seen = ? WHERE id = ?").run(lastSeen, id);
}

export function incrementShowMentions(id: number) {
  getDb().prepare("UPDATE shows SET total_mentions = total_mentions + 1 WHERE id = ?").run(id);
}

export function hideShow(id: number) {
  getDb().prepare("UPDATE shows SET hidden = 1 WHERE id = ?").run(id);
}

export function unhideShow(id: number) {
  getDb().prepare("UPDATE shows SET hidden = 0 WHERE id = ?").run(id);
}

export function markShowInSonarr(id: number, inSonarr: boolean = true) {
  getDb().prepare("UPDATE shows SET in_sonarr = ? WHERE id = ?").run(inSonarr ? 1 : 0, id);
}

export function getAllShows(sort: string = "score", limit: number = 100, offset: number = 0, includeHidden: boolean = false) {
  let orderBy = "s.total_mentions DESC";
  if (sort === "score") orderBy = "avg_sentiment DESC";
  else if (sort === "name") orderBy = "s.name ASC";
  else if (sort === "recent") orderBy = "s.last_seen DESC";
  else if (sort === "mentions") orderBy = "s.total_mentions DESC";

  let where = "WHERE s.hidden = 0 AND s.in_sonarr = 0";
  if (includeHidden) {
    where = "WHERE s.hidden = 1";
  }

  return getDb().prepare(`
    SELECT s.*,
      COALESCE(AVG(m.sentiment_score), 5.0) as avg_sentiment,
      COUNT(m.id) as mention_count
    FROM shows s
    LEFT JOIN mentions m ON m.show_id = s.id
    ${where}
    GROUP BY s.id
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(limit, offset) as (ShowRow & { avg_sentiment: number; mention_count: number })[];
}

export function getShowsCount() {
  const row = getDb().prepare("SELECT COUNT(*) as count FROM shows").get() as { count: number };
  return row.count;
}

// ── Mention helpers ──

export function insertMention(mention: Omit<MentionRow, "id">) {
  return getDb().prepare(`
    INSERT OR IGNORE INTO mentions (show_id, thread_id, comment_reddit_id, comment_body, sentiment_score, raw_sentiment, created_at)
    VALUES (@show_id, @thread_id, @comment_reddit_id, @comment_body, @sentiment_score, @raw_sentiment, @created_at)
  `).run(mention);
}

export function getMentionsForShow(showId: number) {
  return getDb().prepare(`
    SELECT m.*, t.week_of, t.title as thread_title
    FROM mentions m
    JOIN threads t ON t.id = m.thread_id
    WHERE m.show_id = ?
    ORDER BY t.week_of DESC
  `).all(showId) as (MentionRow & { week_of: string; thread_title: string })[];
}

export function getShowWeeklySentiment(showId: number) {
  return getDb().prepare(`
    SELECT t.week_of, AVG(m.sentiment_score) as avg_sentiment, COUNT(m.id) as mention_count
    FROM mentions m
    JOIN threads t ON t.id = m.thread_id
    WHERE m.show_id = ?
    GROUP BY t.week_of
    ORDER BY t.week_of ASC
  `).all(showId) as { week_of: string; avg_sentiment: number; mention_count: number }[];
}

export function getTopShowsForWeek(weekOf: string, limit: number = 10) {
  return getDb().prepare(`
    SELECT s.*, AVG(m.sentiment_score) as avg_sentiment, COUNT(m.id) as mention_count
    FROM mentions m
    JOIN shows s ON s.id = m.show_id
    JOIN threads t ON t.id = m.thread_id
    WHERE t.week_of = ? AND s.hidden = 0 AND s.in_sonarr = 0
    GROUP BY s.id
    ORDER BY avg_sentiment DESC
    LIMIT ?
  `).all(weekOf, limit) as (ShowRow & { avg_sentiment: number; mention_count: number })[];
}

export function getMostDiscussedForWeek(weekOf: string, limit: number = 10) {
  return getDb().prepare(`
    SELECT s.*, AVG(m.sentiment_score) as avg_sentiment, COUNT(m.id) as mention_count
    FROM mentions m
    JOIN shows s ON s.id = m.show_id
    JOIN threads t ON t.id = m.thread_id
    WHERE t.week_of = ? AND s.hidden = 0 AND s.in_sonarr = 0
    GROUP BY s.id
    ORDER BY mention_count DESC
    LIMIT ?
  `).all(weekOf, limit) as (ShowRow & { avg_sentiment: number; mention_count: number })[];
}

export function getLatestWeek() {
  const row = getDb().prepare("SELECT week_of FROM threads ORDER BY week_of DESC LIMIT 1").get() as { week_of: string } | undefined;
  return row?.week_of;
}

export function getStats() {
  const shows = getDb().prepare("SELECT COUNT(*) as count FROM shows").get() as { count: number };
  const mentions = getDb().prepare("SELECT COUNT(*) as count FROM mentions").get() as { count: number };
  const threads = getDb().prepare("SELECT COUNT(*) as count FROM threads").get() as { count: number };
  return {
    totalShows: shows.count,
    totalMentions: mentions.count,
    totalThreads: threads.count,
  };
}

// ── Types ──

export interface ThreadRow {
  id: number;
  reddit_id: string;
  title: string;
  url: string;
  week_of: string;
  scraped_at: string;
  comment_count: number;
}

export interface ShowRow {
  id: number;
  name: string;
  tvdb_id: number | null;
  tvdb_slug: string | null;
  tvdb_image_url: string | null;
  tvdb_year: string | null;
  tvdb_network: string | null;
  tvdb_status: string | null;
  tvdb_overview: string | null;
  first_seen: string;
  last_seen: string;
  total_mentions: number;
  hidden: number;
  in_sonarr: number;
}

export interface MentionRow {
  id: number;
  show_id: number;
  thread_id: number;
  comment_reddit_id: string;
  comment_body: string;
  sentiment_score: number;
  raw_sentiment: number;
  created_at: string;
}
