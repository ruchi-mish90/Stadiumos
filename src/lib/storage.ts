// src/lib/storage.ts
// Thin, typed persistence layer. Isolated here so components never touch
// window.localStorage directly and the app degrades gracefully with storage
// disabled (private browsing, SSR, quota errors) instead of throwing.

import type { AchievementId, ChallengeId } from "./types";

const BEST_SCORES_KEY = "stadiumos:best-scores:v1";
const ACHIEVEMENTS_KEY = "stadiumos:achievements:v1";

export type BestScores = Partial<Record<ChallengeId, { stars: 0 | 1 | 2 | 3; elapsedSeconds: number }>>;

function safeRead<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWrite<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (quota exceeded, private mode) — fail silently,
    // the session still works, it just won't persist.
  }
}

export function loadBestScores(): BestScores {
  return safeRead<BestScores>(BEST_SCORES_KEY, {});
}

export function saveBestScore(
  challengeId: ChallengeId,
  stars: 0 | 1 | 2 | 3,
  elapsedSeconds: number,
): BestScores {
  const current = loadBestScores();
  const existing = current[challengeId];
  if (!existing || stars > existing.stars || (stars === existing.stars && elapsedSeconds < existing.elapsedSeconds)) {
    const next: BestScores = { ...current, [challengeId]: { stars, elapsedSeconds } };
    safeWrite(BEST_SCORES_KEY, next);
    return next;
  }
  return current;
}

export function loadUnlockedAchievements(): AchievementId[] {
  return safeRead<AchievementId[]>(ACHIEVEMENTS_KEY, []);
}

export function unlockAchievements(ids: AchievementId[]): AchievementId[] {
  if (ids.length === 0) return loadUnlockedAchievements();
  const current = new Set(loadUnlockedAchievements());
  const before = current.size;
  ids.forEach((id) => current.add(id));
  const next = Array.from(current);
  if (next.length !== before) safeWrite(ACHIEVEMENTS_KEY, next);
  return next;
}
