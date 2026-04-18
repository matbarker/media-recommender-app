/**
 * Cron scheduler for automatic scraping.
 * Starts a node-cron job inside the Next.js server process.
 */

import cron from "node-cron";
import { scrapeLatestThread } from "./scraper";

let isScheduled = false;

export function startScheduler() {
  if (isScheduled) return;

  const schedule = process.env.SCRAPE_CRON || "0 23 * * 4"; // Default: Thursday 23:00

  if (!cron.validate(schedule)) {
    console.error(`[Scheduler] Invalid cron expression: ${schedule}`);
    return;
  }

  cron.schedule(schedule, async () => {
    console.log(`[Scheduler] Starting weekly scrape at ${new Date().toISOString()}`);
    try {
      const result = await scrapeLatestThread();
      console.log(`[Scheduler] Scrape complete:`, {
        thread: result.threadTitle,
        week: result.weekOf,
        comments: result.commentsProcessed,
        shows: result.showsFound,
        mentions: result.mentionsCreated,
        skipped: result.skipped,
        errors: result.errors.length,
      });
    } catch (err) {
      console.error(`[Scheduler] Scrape failed:`, err);
    }
  });

  isScheduled = true;
  console.log(`[Scheduler] Cron job scheduled: ${schedule}`);
}
