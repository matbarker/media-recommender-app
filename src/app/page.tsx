"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { EyeOff, Eye } from "lucide-react";

interface Show {
  id: number;
  name: string;
  tvdb_image_url: string | null;
  tvdb_year: string | null;
  tvdb_network: string | null;
  total_mentions: number;
  avg_sentiment: number;
  mention_count: number;
  hidden: number;
  in_sonarr: number;
}

interface Stats {
  totalShows: number;
  totalMentions: number;
  totalThreads: number;
}

function getSentimentClass(score: number): string {
  if (score >= 8) return "sentiment-great";
  if (score >= 6.5) return "sentiment-good";
  if (score >= 4.5) return "sentiment-neutral";
  if (score >= 3) return "sentiment-bad";
  return "sentiment-terrible";
}

export default function DashboardPage() {
  const [topShows, setTopShows] = useState<Show[]>([]);
  const [ignoredShows, setIgnoredShows] = useState<Show[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [latestWeek, setLatestWeek] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showIgnored, setShowIgnored] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [mainRes, ignoredRes] = await Promise.all([
        fetch("/api/shows?sort=score&limit=10"),
        fetch("/api/shows?view=ignored&limit=100"),
      ]);
      const mainData = await mainRes.json();
      const ignoredData = await ignoredRes.json();

      setTopShows(mainData.shows || []);
      setStats(mainData.stats);
      setLatestWeek(mainData.latestWeek || "");
      setIgnoredShows(ignoredData.shows || []);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleHide(id: number) {
    // Optimistic UI: move from top to ignored
    const show = topShows.find(s => s.id === id);
    setTopShows(prev => prev.filter(s => s.id !== id));
    if (show) {
      setIgnoredShows(prev => [...prev, { ...show, hidden: 1 }].sort((a, b) => a.name.localeCompare(b.name)));
    }
    try {
      await fetch(`/api/shows/${id}/hide`, { method: "POST" });
    } catch { /* ignore */ }
  }

  async function handleUnhide(id: number) {
    const show = ignoredShows.find(s => s.id === id);
    // Only unhide manually-hidden shows, not sonarr shows
    if (show?.in_sonarr) return;
    setIgnoredShows(prev => prev.filter(s => s.id !== id));
    try {
      await fetch(`/api/shows/${id}/unhide`, { method: "POST" });
      // Reload to get proper positioning
      loadData();
    } catch { /* ignore */ }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" style={{ width: 40, height: 40 }}></div>
        <p style={{ marginTop: 16 }}>Loading dashboard...</p>
      </div>
    );
  }

  const hasData = stats && stats.totalShows > 0;

  return (
    <>
      <h1 className="page-heading">Dashboard</h1>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.totalShows || 0}</div>
          <div className="stat-label">Shows Tracked</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalMentions || 0}</div>
          <div className="stat-label">Total Mentions</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats?.totalThreads || 0}</div>
          <div className="stat-label">Weeks Analyzed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{latestWeek || "—"}</div>
          <div className="stat-label">Latest Week</div>
        </div>
      </div>

      {!hasData && (
        <div className="empty-state">
          <div className="empty-state-icon">📡</div>
          <h3>No data yet</h3>
          <p>Head to the <Link href="/admin">Admin</Link> page to trigger your first scrape or backfill historical threads.</p>
        </div>
      )}

      {hasData && (
        <>
          {/* Top Shows */}
          <section style={{ marginBottom: 40 }}>
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">🔥</span>
                Top Recommended Shows
              </h2>
              <Link href="/shows?sort=score" style={{ fontSize: "0.85rem" }}>View all →</Link>
            </div>
            <div className="show-grid">
              {topShows.map((show) => (
                <ShowCard key={show.id} show={show} onHide={handleHide} />
              ))}
            </div>
            {topShows.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No shows to recommend. All shows are hidden or in Sonarr.</p>
            )}
          </section>

          {/* Ignored Shows */}
          {ignoredShows.length > 0 && (
            <section>
              <div className="section-header">
                <h2 className="section-title" style={{ cursor: "pointer" }} onClick={() => setShowIgnored(!showIgnored)}>
                  <span className="section-icon">{showIgnored ? "▼" : "▶"}</span>
                  Ignored ({ignoredShows.length})
                </h2>
              </div>
              {showIgnored && (
                <div className="show-grid">
                  {ignoredShows.map((show) => (
                    <IgnoredShowCard key={show.id} show={show} onUnhide={handleUnhide} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </>
  );
}

function ShowCard({ show, onHide }: { show: Show; onHide: (id: number) => void }) {
  const score = Math.round(show.avg_sentiment * 10) / 10;
  return (
    <div className="card show-card" style={{ position: "relative", padding: 0, overflow: "hidden" }}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onHide(show.id); }}
        style={{
          position: "absolute", top: 8, right: 8, zIndex: 10,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
          border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%",
          width: 32, height: 32, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", transition: "all 0.2s",
        }}
        title="Hide from dashboard"
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.7)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.55)"; }}
      >
        <EyeOff size={16} />
      </button>
      <Link href={`/shows/${show.id}`} style={{ display: "block", height: "100%" }}>
        {show.tvdb_image_url ? (
          <img src={show.tvdb_image_url} alt={show.name} className="show-poster" loading="lazy" />
        ) : (
          <div className="show-poster-placeholder">📺</div>
        )}
        <div className="show-info" style={{ padding: "16px" }}>
          <div className="show-name">{show.name}</div>
          <div className="show-meta">
            {show.tvdb_year && <span>{show.tvdb_year}</span>}
            {show.tvdb_network && <span> · {show.tvdb_network}</span>}
          </div>
          <div className="show-stats">
            <span className={`sentiment-badge ${getSentimentClass(score)}`}>
              {score.toFixed(1)}
            </span>
            <span className="mention-count">{show.total_mentions} mention{show.total_mentions !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}

function IgnoredShowCard({ show, onUnhide }: { show: Show; onUnhide: (id: number) => void }) {
  const score = Math.round(show.avg_sentiment * 10) / 10;
  const isSonarr = show.in_sonarr === 1;

  return (
    <div
      className="card show-card"
      style={{ position: "relative", padding: 0, overflow: "hidden", opacity: 0.65 }}
    >
      {/* Sonarr badge or unhide button */}
      {isSonarr ? (
        <div
          style={{
            position: "absolute", top: 8, right: 8, zIndex: 10,
            background: "rgba(34,197,94,0.85)", backdropFilter: "blur(4px)",
            borderRadius: 6, padding: "3px 8px",
            fontSize: "0.7rem", fontWeight: 700, color: "#fff",
            display: "flex", alignItems: "center", gap: 4,
          }}
          title="Already in Sonarr"
        >
          📥 Sonarr
        </div>
      ) : (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnhide(show.id); }}
          style={{
            position: "absolute", top: 8, right: 8, zIndex: 10,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(8px)",
            border: "1px solid rgba(255,255,255,0.15)", borderRadius: "50%",
            width: 32, height: 32, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", transition: "all 0.2s",
          }}
          title="Unhide show"
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(34,197,94,0.7)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(0,0,0,0.55)"; }}
        >
          <Eye size={16} />
        </button>
      )}
      <Link href={`/shows/${show.id}`} style={{ display: "block", height: "100%" }}>
        {show.tvdb_image_url ? (
          <img src={show.tvdb_image_url} alt={show.name} className="show-poster" loading="lazy" />
        ) : (
          <div className="show-poster-placeholder">📺</div>
        )}
        <div className="show-info" style={{ padding: "16px" }}>
          <div className="show-name">{show.name}</div>
          <div className="show-meta">
            {isSonarr && <span style={{ color: "var(--sentiment-great)" }}>In Sonarr</span>}
            {!isSonarr && <span style={{ color: "var(--text-muted)" }}>Hidden</span>}
            {show.tvdb_year && <span> · {show.tvdb_year}</span>}
          </div>
          <div className="show-stats">
            <span className={`sentiment-badge ${getSentimentClass(score)}`}>
              {score.toFixed(1)}
            </span>
            <span className="mention-count">{show.total_mentions} mention{show.total_mentions !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </Link>
    </div>
  );
}
