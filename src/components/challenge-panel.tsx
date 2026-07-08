"use client";

import { CHALLENGES } from "@/lib/challenges";
import { ACHIEVEMENTS } from "@/lib/achievements";
import type { AchievementId, ChallengeId, ChallengeProgress, ChallengeResult } from "@/lib/types";
import type { BestScores } from "@/lib/storage";

interface Props {
  activeChallengeId: ChallengeId | null;
  progress: ChallengeProgress | null;
  lastResult: ChallengeResult | null;
  bestScores: BestScores;
  unlockedAchievements: AchievementId[];
  onStart: (id: ChallengeId) => void;
  onDismissResult: () => void;
}

function Stars({ count }: { count: 0 | 1 | 2 | 3 }) {
  return (
    <span className="stars" aria-label={`${count} of 3 stars`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= count ? "stars__on" : "stars__off"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function ChallengePanel({
  activeChallengeId,
  progress,
  lastResult,
  bestScores,
  unlockedAchievements,
  onStart,
  onDismissResult,
}: Props) {
  return (
    <section className="challenge-panel">
      <h3>Scenario challenges</h3>
      <ul className="challenge-list">
        {CHALLENGES.map((challenge) => {
          const isActive = activeChallengeId === challenge.id;
          const best = bestScores[challenge.id];
          return (
            <li key={challenge.id} className={`challenge-card${isActive ? " challenge-card--active" : ""}`}>
              <div className="challenge-card__head">
                <span className="challenge-card__title">{challenge.title}</span>
                {best && <Stars count={best.stars} />}
              </div>
              <p className="challenge-card__briefing">{challenge.briefing}</p>
              {isActive && progress ? (
                <div className="challenge-card__progress">
                  <div className="challenge-card__progress-track">
                    <div
                      className="challenge-card__progress-fill"
                      style={{ width: `${Math.round(progress.completion * 100)}%` }}
                    />
                  </div>
                  <div className="challenge-card__progress-meta">
                    <span>{progress.headline}</span>
                    <span>
                      {Math.min(progress.elapsedSeconds, progress.timeLimitSeconds).toFixed(0)}s / {progress.timeLimitSeconds}s
                    </span>
                  </div>
                  <span className="challenge-card__detail">{progress.detail}</span>
                </div>
              ) : (
                <button type="button" className="btn btn--primary btn--full" onClick={() => onStart(challenge.id)}>
                  Start challenge
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <h3>Achievements</h3>
      <ul className="achievement-list">
        {ACHIEVEMENTS.map((a) => {
          const unlocked = unlockedAchievements.includes(a.id);
          return (
            <li key={a.id} className={`achievement${unlocked ? " achievement--unlocked" : ""}`}>
              <span className="achievement__badge">{unlocked ? "✓" : "•"}</span>
              <div>
                <span className="achievement__title">{a.title}</span>
                <span className="achievement__desc">{a.description}</span>
              </div>
            </li>
          );
        })}
      </ul>

      {lastResult && (
        <div className={`result-toast${lastResult.success ? " result-toast--success" : " result-toast--fail"}`}>
          <div>
            <strong>{lastResult.success ? "Objective complete" : "Objective failed"}</strong>
            <p>{lastResult.summary}</p>
            {lastResult.success && <Stars count={lastResult.stars} />}
          </div>
          <button type="button" className="btn btn--ghost" onClick={onDismissResult}>
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
