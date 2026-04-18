"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Show {
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
}

interface Mention {
  id: number;
  comment_body: string;
  sentiment_score: number;
  created_at: string;
  week_of: string;
}

interface WeeklySentiment {
  week_of: string;
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

function getSentimentLabel(score: number): string {
  if (score >= 8) return "Very Positive";
  if (score >= 6.5) return "Positive";
  if (score >= 4.5) return "Neutral";
  if (score >= 3) return "Negative";
  return "Very Negative";
}

export default function ShowDetailPage() {
  const params = useParams();
  const [show, setShow] = useState<Show | null>(null);
  const [avgSentiment, setAvgSentiment] = useState(5);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [weeklySentiment, setWeeklySentiment] = useState<WeeklySentiment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/shows/${params.id}`);
        if (!res.ok) throw new Error("Not found");
        const data = await res.json();
        setShow(data.show);
        setAvgSentiment(data.avgSentiment);
        setMentions(data.mentions);
        setWeeklySentiment(data.weeklySentiment);
      } catch (err) {
        console.error("Failed to load show:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [params.id]);

  if (loading) {
    return (
      <div className="empty-state">
        <div className="loading-spinner" style={{ width: 40, height: 40 }}></div>
        <p style={{ marginTop: 16 }}>Loading show details...</p>
      </div>
    );
  }

  if (!show) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">❌</div>
        <h3>Show not found</h3>
        <Link href="/shows" className="back-link">← Back to all shows</Link>
      </div>
    );
  }

  const score = Math.round(avgSentiment * 10) / 10;
  const maxSentiment = Math.max(...weeklySentiment.map((w) => w.avg_sentiment), 10);

  return (
    <>
      <Link href="/shows" className="back-link">← Back to all shows</Link>

      {/* Header */}
      <div className="show-detail-header">
        {show.tvdb_image_url ? (
          <img src={show.tvdb_image_url} alt={show.name} className="show-detail-poster" />
        ) : (
          <div className="show-detail-poster-placeholder">📺</div>
        )}
        <div className="show-detail-info">
          <h1>{show.name}</h1>
          <div className="show-detail-meta">
            {show.tvdb_year && <span>📅 {show.tvdb_year}</span>}
            {show.tvdb_network && <span>📡 {show.tvdb_network}</span>}
            {show.tvdb_status && <span>📊 {show.tvdb_status}</span>}
          </div>

          <div className="show-detail-score">
            <span className={`big-score`} style={{ color: `var(--${getSentimentClass(score).replace("sentiment-", "sentiment-")})` }}>
              {score.toFixed(1)}
            </span>
            <div>
              <div className={`sentiment-badge ${getSentimentClass(score)}`}>
                {getSentimentLabel(score)}
              </div>
              <div className="score-label" style={{ marginTop: 4 }}>
                from {show.total_mentions} mention{show.total_mentions !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {show.tvdb_overview && (
            <p className="show-detail-overview">{show.tvdb_overview}</p>
          )}

          {show.tvdb_slug && (
            <a
              href={`https://thetvdb.com/series/${show.tvdb_slug}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-block", marginTop: 16, fontSize: "0.85rem" }}
            >
              View on TheTVDB →
            </a>
          )}
        </div>
      </div>

      {/* Weekly Sentiment Chart */}
      {weeklySentiment.length > 1 && (
        <section style={{ marginBottom: 40 }}>
          <h2 className="section-title" style={{ marginBottom: 16 }}>
            <span className="section-icon">📈</span>
            Sentiment Over Time
          </h2>
          <div className="card-glass chart-container">
            <div className="bar-chart">
              {weeklySentiment.map((w) => (
                <div key={w.week_of} className="bar-group">
                  <div className="bar-value">{w.avg_sentiment.toFixed(1)}</div>
                  <div
                    className="bar"
                    style={{
                      height: `${(w.avg_sentiment / maxSentiment) * 120}px`,
                    }}
                  ></div>
                  <div className="bar-label">{w.week_of.slice(5)}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Recent Comments */}
      <section>
        <h2 className="section-title" style={{ marginBottom: 16 }}>
          <span className="section-icon">💬</span>
          Recent Comments ({mentions.length})
        </h2>
        <div className="comment-list">
          {mentions.slice(0, 20).map((m) => {
            const mScore = Math.round(m.sentiment_score * 10) / 10;
            return (
              <div key={m.id} className="card comment-card">
                <div className="comment-body">{m.comment_body}</div>
                <div className="comment-meta">
                  <span>Week of {m.week_of}</span>
                  <span className={`sentiment-badge ${getSentimentClass(mScore)}`}>
                    {mScore.toFixed(1)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {mentions.length === 0 && (
          <p style={{ color: "var(--text-muted)" }}>No comments found for this show.</p>
        )}
      </section>
    </>
  );
}
