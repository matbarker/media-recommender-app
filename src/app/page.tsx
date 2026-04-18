"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Show {
  id: number;
  name: string;
  tvdb_image_url: string | null;
  tvdb_year: string | null;
  tvdb_network: string | null;
  total_mentions: number;
  avg_sentiment: number;
  mention_count: number;
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
  const [stats, setStats] = useState<Stats | null>(null);
  const [latestWeek, setLatestWeek] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/shows");
        const data = await res.json();
        setStats(data.stats);
        setLatestWeek(data.latestWeek || "");

        if (data.latestWeek) {
          const [trendRes, discRes] = await Promise.all([
            fetch(`/api/shows?view=trending&week=${data.latestWeek}&limit=12`),
            fetch(`/api/shows?view=discussed&week=${data.latestWeek}&limit=12`),
          ]);
          const trendData = await trendRes.json();
          const discData = await discRes.json();

          const combined = [...(trendData.shows || []), ...(discData.shows || [])];
          const unique = Array.from(new Map(combined.map(s => [s.id, s])).values());
          unique.sort((a, b) => (b.mention_count * b.avg_sentiment) - (a.mention_count * a.avg_sentiment));
          
          setTopShows(unique.slice(0, 16));
        }
      } catch (err) {
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

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
          {/* Top Shows This Week */}
          <section style={{ marginBottom: 40 }}>
            <div className="section-header">
              <h2 className="section-title">
                <span className="section-icon">🔥</span>
                Top Shows This Week
              </h2>
              <Link href="/shows?sort=score" style={{ fontSize: "0.85rem" }}>View all →</Link>
            </div>
            <div className="show-grid">
              {topShows.map((show) => (
                <ShowCard key={show.id} show={show} />
              ))}
            </div>
            {topShows.length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>No shows for this week yet.</p>
            )}
          </section>
        </>
      )}
    </>
  );
}

function ShowCard({ show }: { show: Show }) {
  const score = Math.round(show.avg_sentiment * 10) / 10;
  return (
    <Link href={`/shows/${show.id}`} className="card show-card">
      {show.tvdb_image_url ? (
        <img
          src={show.tvdb_image_url}
          alt={show.name}
          className="show-poster"
          loading="lazy"
        />
      ) : (
        <div className="show-poster-placeholder">📺</div>
      )}
      <div className="show-info">
        <div className="show-name">{show.name}</div>
        <div className="show-meta">
          {show.tvdb_year && <span>{show.tvdb_year}</span>}
          {show.tvdb_network && <span> · {show.tvdb_network}</span>}
        </div>
        <div className="show-stats">
          <span className={`sentiment-badge ${getSentimentClass(score)}`}>
            {score.toFixed(1)}
          </span>
          <span className="mention-count">{show.mention_count} mention{show.mention_count !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </Link>
  );
}
