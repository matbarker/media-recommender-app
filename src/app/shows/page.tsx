"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

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

function ShowsContent() {
  const searchParams = useSearchParams();
  const initialSort = searchParams.get("sort") || "score";

  const [shows, setShows] = useState<Show[]>([]);
  const [sort, setSort] = useState(initialSort);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/shows?sort=${sort}&limit=200`);
        const data = await res.json();
        setShows(data.shows || []);
      } catch (err) {
        console.error("Failed to load shows:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [sort]);

  const filtered = search
    ? shows.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : shows;

  return (
    <>
      <h1 className="page-heading">All Shows</h1>

      <div className="shows-controls">
        <div className="sort-buttons">
          {[
            { key: "score", label: "Top Rated" },
            { key: "mentions", label: "Most Mentioned" },
            { key: "recent", label: "Recently Seen" },
            { key: "name", label: "A–Z" },
          ].map((opt) => (
            <button
              key={opt.key}
              className={`sort-btn ${sort === opt.key ? "active" : ""}`}
              onClick={() => setSort(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="Search shows..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="empty-state">
          <div className="loading-spinner" style={{ width: 40, height: 40 }}></div>
          <p style={{ marginTop: 16 }}>Loading shows...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3>{search ? "No matches found" : "No shows tracked yet"}</h3>
          <p>{search ? "Try a different search term." : "Scrape some threads to get started."}</p>
        </div>
      ) : (
        <div className="show-grid">
          {filtered.map((show) => {
            const score = Math.round(show.avg_sentiment * 10) / 10;
            return (
              <Link href={`/shows/${show.id}`} key={show.id} className="card show-card">
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

export default function ShowsPage() {
  return (
    <Suspense fallback={
      <div className="empty-state">
        <div className="loading-spinner" style={{ width: 40, height: 40 }}></div>
      </div>
    }>
      <ShowsContent />
    </Suspense>
  );
}
