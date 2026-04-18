/**
 * Sentiment analysis for Reddit comments about TV shows.
 * Uses the AFINN-165 lexicon via the 'sentiment' npm package.
 * Normalizes raw scores to a 1-10 scale.
 */

import Sentiment from "sentiment";

const analyzer = new Sentiment();

export interface SentimentResult {
  /** Normalized score from 1 (very negative) to 10 (very positive) */
  score: number;
  /** Raw comparative score from AFINN */
  raw: number;
  /** Positive words found */
  positive: string[];
  /** Negative words found */
  negative: string[];
}

/**
 * Analyze the sentiment of a comment.
 * Returns a score from 1 to 10 where:
 * - 1-3: Negative
 * - 4-6: Neutral
 * - 7-10: Positive
 */
export function analyzeSentiment(text: string): SentimentResult {
  const result = analyzer.analyze(text);

  // The comparative score is normalized by text length,
  // typically ranges from about -1 to +1 for most text.
  // We map it to a 1-10 scale.
  const normalized = Math.min(10, Math.max(1, 5 + result.comparative * 5));

  return {
    score: Math.round(normalized * 10) / 10,
    raw: result.comparative,
    positive: result.positive,
    negative: result.negative,
  };
}

/**
 * Get a human-readable label for a sentiment score.
 */
export function sentimentLabel(score: number): string {
  if (score >= 8) return "Very Positive";
  if (score >= 6.5) return "Positive";
  if (score >= 4.5) return "Neutral";
  if (score >= 3) return "Negative";
  return "Very Negative";
}

/**
 * Get a color for a sentiment score (CSS color string).
 */
export function sentimentColor(score: number): string {
  if (score >= 8) return "#22c55e";
  if (score >= 6.5) return "#86efac";
  if (score >= 4.5) return "#fbbf24";
  if (score >= 3) return "#fb923c";
  return "#ef4444";
}
