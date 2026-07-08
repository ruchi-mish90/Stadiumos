// src/lib/achievements.ts
import type { AchievementDefinition, AchievementId, ChallengeResult, MetricSnapshot } from "./types";

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "sell-out",
    title: "Sell Out",
    description: "Reach 600 simultaneous guests in a single simulation.",
  },
  {
    id: "clean-sweep",
    title: "Clean Sweep",
    description: "Earn 3 stars on Rush Hour.",
  },
  {
    id: "zero-panic",
    title: "Zero Panic",
    description: "Complete Evacuation Drill without a single bottleneck alert.",
  },
  {
    id: "crowd-whisperer",
    title: "Crowd Whisperer",
    description: "Complete all three challenges with 2 stars or better.",
  },
];

const SELL_OUT_THRESHOLD = 600;

/** Checked continuously against the live snapshot, independent of challenges. */
export function checkLiveAchievements(snapshot: MetricSnapshot): AchievementId[] {
  const unlocked: AchievementId[] = [];
  if (snapshot.totalOccupancy >= SELL_OUT_THRESHOLD) unlocked.push("sell-out");
  return unlocked;
}

/** Checked whenever a challenge result comes in. */
export function checkResultAchievements(
  result: ChallengeResult,
  dangerEventsDuringRun: number,
  allBestStars: Record<string, number>,
): AchievementId[] {
  const unlocked: AchievementId[] = [];

  if (result.challengeId === "rush-hour" && result.stars === 3) {
    unlocked.push("clean-sweep");
  }
  if (result.challengeId === "evacuation-drill" && result.success && dangerEventsDuringRun === 0) {
    unlocked.push("zero-panic");
  }

  const projectedStars = { ...allBestStars, [result.challengeId]: Math.max(allBestStars[result.challengeId] ?? 0, result.stars) };
  const allChallengeIds = ["rush-hour", "halftime-surge", "evacuation-drill"];
  const allAtLeastTwoStars = allChallengeIds.every((id) => (projectedStars[id] ?? 0) >= 2);
  if (allAtLeastTwoStars) unlocked.push("crowd-whisperer");

  return unlocked;
}
