"use client";

import { useState } from "react";

interface ScrapeResult {
  threadTitle: string;
  weekOf: string;
  commentsProcessed: number;
  showsFound: number;
  mentionsCreated: number;
  errors: string[];
  skipped: boolean;
}

export default function AdminPage() {
  const [scrapeStatus, setScrapeStatus] = useState<string>("");
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [backfillCount, setBackfillCount] = useState(10);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillStatus, setBackfillStatus] = useState<string>("");
  const [results, setResults] = useState<ScrapeResult[]>([]);

  async function handleScrape() {
    setScrapeLoading(true);
    setScrapeStatus("Scraping latest thread...");
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setScrapeStatus(`Error: ${data.error}`);
      } else {
        const r = data.result as ScrapeResult;
        if (r.skipped) {
          setScrapeStatus(`Skipped: "${r.threadTitle}" was already scraped.`);
        } else {
          setScrapeStatus(
            `Done! "${r.threadTitle}" — ${r.commentsProcessed} comments, ${r.showsFound} new shows, ${r.mentionsCreated} mentions.` +
            (r.errors.length > 0 ? ` (${r.errors.length} errors)` : "")
          );
        }
      }
    } catch (err) {
      setScrapeStatus(`Failed: ${err}`);
    } finally {
      setScrapeLoading(false);
    }
  }

  async function handleBackfill() {
    setBackfillLoading(true);
    setBackfillStatus(`Backfilling ${backfillCount} threads... This may take a few minutes.`);
    setResults([]);
    try {
      const res = await fetch("/api/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: backfillCount }),
      });
      const data = await res.json();
      if (data.error) {
        setBackfillStatus(`Error: ${data.error}`);
      } else {
        const results = data.results as ScrapeResult[];
        setResults(results);
        const scraped = results.filter((r) => !r.skipped);
        const skipped = results.filter((r) => r.skipped);
        setBackfillStatus(
          `Done! ${scraped.length} threads scraped, ${skipped.length} skipped (already processed).`
        );
      }
    } catch (err) {
      setBackfillStatus(`Failed: ${err}`);
    } finally {
      setBackfillLoading(false);
    }
  }

  return (
    <>
      <h1 className="page-heading">Admin</h1>

      {/* Scrape Latest */}
      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>
          <span className="section-icon">📡</span>
          Scrape Latest Thread
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 16, fontSize: "0.9rem" }}>
          Fetch the most recent &quot;What are you watching?&quot; thread and analyze it.
        </p>
        <button
          className="btn btn-primary"
          onClick={handleScrape}
          disabled={scrapeLoading}
        >
          {scrapeLoading ? (
            <>
              <span className="loading-spinner"></span>
              Scraping...
            </>
          ) : (
            "Scrape Now"
          )}
        </button>
        {scrapeStatus && (
          <div className={`status-message ${scrapeLoading ? "status-loading" : scrapeStatus.startsWith("Error") || scrapeStatus.startsWith("Failed") ? "status-error" : "status-success"}`}>
            {scrapeStatus}
          </div>
        )}
      </section>

      {/* Backfill */}
      <section className="card" style={{ marginBottom: 24 }}>
        <h2 className="section-title" style={{ marginBottom: 12 }}>
          <span className="section-icon">⏪</span>
          Backfill Historical Threads
        </h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: 16, fontSize: "0.9rem" }}>
          Scrape older weekly threads to build up historical data. Already-scraped threads will be skipped.
        </p>
        <div className="admin-actions">
          <label style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
            Number of weeks:
          </label>
          <input
            type="number"
            className="input-small"
            min={1}
            max={52}
            value={backfillCount}
            onChange={(e) => setBackfillCount(parseInt(e.target.value) || 10)}
          />
          <button
            className="btn btn-secondary"
            onClick={handleBackfill}
            disabled={backfillLoading}
          >
            {backfillLoading ? (
              <>
                <span className="loading-spinner"></span>
                Backfilling...
              </>
            ) : (
              `Backfill ${backfillCount} Weeks`
            )}
          </button>
        </div>
        {backfillStatus && (
          <div className={`status-message ${backfillLoading ? "status-loading" : backfillStatus.startsWith("Error") || backfillStatus.startsWith("Failed") ? "status-error" : "status-success"}`}>
            {backfillStatus}
          </div>
        )}

        {/* Backfill Results */}
        {results.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: "0.95rem", marginBottom: 8 }}>Results:</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: "0.8rem",
                    padding: "8px 12px",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-sm)",
                    color: r.skipped ? "var(--text-muted)" : "var(--text-secondary)",
                  }}
                >
                  <strong>{r.weekOf}</strong>
                  {r.skipped
                    ? " — skipped"
                    : ` — ${r.commentsProcessed} comments, ${r.showsFound} shows, ${r.mentionsCreated} mentions`}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Info */}
      <section className="card-glass" style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
        <p><strong>Automatic scraping:</strong> A cron job runs weekly (configured via SCRAPE_CRON env var, default: Thursdays at 23:00 UTC).</p>
        <p style={{ marginTop: 8 }}><strong>Note:</strong> Each scrape may take 1–3 minutes depending on the number of comments. The TheTVDB API is queried to verify show names.</p>
      </section>
    </>
  );
}
