"use client";

import { useEffect, useState, Suspense } from "react";
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

function getSentimentClass(score: number): string {
  if (score >= 8) return "sentiment-great";
  if (score >= 6.5) return "sentiment-good";
  if (score >= 4.5) return "sentiment-neutral";
  if (score >= 3) return "sentiment-bad";
  return "sentiment-terrible";
}

function HiddenShowsContent() {
  const [shows, setShows] = useState<Show[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/shows?includeHidden=true&limit=200`);
        const data = await res.json();
        setShows(data.shows || []);
      } catch (err) {
        console.error("Failed to load shows:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <>
      <h1 className="page-heading">Ignored Shows</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>These are shows you have explicitly hidden from your main views.</p>

      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" style={{ width: 40, height: 40 }}></div>
          <p style={{ marginTop: 16 }}>Loading ignored shows...</p>
        </div>
      ) : shows.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🙈</div>
          <h3>No ignored shows</h3>
          <p>You haven't hidden any shows yet.</p>
        </div>
      ) : (
        <div className="show-grid">
          {shows.map((show) => {
            const score = Math.round(show.avg_sentiment * 10) / 10;
            return (
              <Link href={`/shows/${show.id}`} key={show.id} className="card show-card" style={{ opacity: 0.7 }}>
                {show.tvdb_image_url ? (
                  <img src={show.tvdb_image_url} alt={show.name} className="show-poster" loading="lazy" />
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
                    <span className="mention-count">
                      {show.total_mentions} mention{show.total_mentions !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function HiddenShowsPage() {
  return (
    <Suspense fallback={<div className="empty-state"><div className="loading-spinner" style={{ width: 40, height: 40 }}></div></div>}>
      <HiddenShowsContent />
    </Suspense>
  );
}
