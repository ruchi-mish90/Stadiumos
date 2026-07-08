// src/lib/challenges.ts
import type {
  ChallengeDefinition,
  ChallengeId,
  ChallengeProgress,
  ChallengeResult,
} from "./types";
import type { SimulationEngine } from "./simulation";

export const CHALLENGES: ChallengeDefinition[] = [
  {
    id: "rush-hour",
    title: "Rush Hour",
    briefing: "Fill the stadium to 450 guests inside 90 seconds without triggering a bottleneck.",
    targetReality: "peak-rush",
    timeLimitSeconds: 90,
  },
  {
    id: "halftime-surge",
    title: "Halftime Surge",
    briefing: "Hold every concession and restroom queue to 6 people or fewer for a full 60 seconds.",
    targetReality: "baseline",
    timeLimitSeconds: 60,
  },
  {
    id: "evacuation-drill",
    title: "Evacuation Drill",
    briefing: "Alarm sounds at T+5s. Clear the stadium to zero occupants inside 75 seconds.",
    targetReality: "evacuation",
    timeLimitSeconds: 75,
  },
];

export function getChallenge(id: ChallengeId): ChallengeDefinition {
  const found = CHALLENGES.find((c) => c.id === id);
  if (!found) throw new Error(`Unknown challenge id: ${id}`);
  return found;
}

const RUSH_HOUR_TARGET = 450;
const QUEUE_VIOLATION_THRESHOLD = 6;

interface HalftimeStats {
  maxQueue: number;
  violationSeconds: number;
}

function halftimeStats(engine: SimulationEngine): HalftimeStats {
  let maxQueue = 0;
  let violationSeconds = 0;
  for (const snap of engine.metrics.getBuffer()) {
    const snapMax = snap.queueLengths.reduce((m, q) => Math.max(m, q.length), 0);
    maxQueue = Math.max(maxQueue, snapMax);
    if (snapMax > QUEUE_VIOLATION_THRESHOLD) violationSeconds += 1;
  }
  return { maxQueue, violationSeconds };
}

/** Called every tick while a challenge is active. Pure read of engine state. */
export function evaluateChallenge(def: ChallengeDefinition, engine: SimulationEngine): ChallengeProgress {
  const elapsed = engine.elapsedSeconds;
  const timedOut = elapsed >= def.timeLimitSeconds;

  switch (def.id) {
    case "rush-hour": {
      const occupancy = engine.latestSnapshot?.totalOccupancy ?? 0;
      const dangerCount = engine.metrics.getDangerEventCount(0);
      const reached = occupancy >= RUSH_HOUR_TARGET;
      return {
        challengeId: def.id,
        elapsedSeconds: elapsed,
        timeLimitSeconds: def.timeLimitSeconds,
        headline: `${occupancy} / ${RUSH_HOUR_TARGET} guests through the gates`,
        detail: dangerCount > 0 ? `${dangerCount} bottleneck alert(s) raised` : "No bottlenecks yet",
        completion: Math.min(occupancy / RUSH_HOUR_TARGET, 1),
        status: reached ? "success" : timedOut ? "failed" : "running",
      };
    }

    case "halftime-surge": {
      const { maxQueue, violationSeconds } = halftimeStats(engine);
      const success = timedOut && violationSeconds <= 2;
      const failed = timedOut && violationSeconds > 2;
      return {
        challengeId: def.id,
        elapsedSeconds: elapsed,
        timeLimitSeconds: def.timeLimitSeconds,
        headline: `Longest queue so far: ${maxQueue} people`,
        detail: `${violationSeconds}s spent over the ${QUEUE_VIOLATION_THRESHOLD}-person threshold`,
        completion: Math.min(elapsed / def.timeLimitSeconds, 1),
        status: success ? "success" : failed ? "failed" : "running",
      };
    }

    case "evacuation-drill": {
      const occupancy = engine.latestSnapshot?.totalOccupancy ?? engine.agents.length;
      const alarmSounded = elapsed >= 5;
      const cleared = alarmSounded && occupancy === 0;
      return {
        challengeId: def.id,
        elapsedSeconds: elapsed,
        timeLimitSeconds: def.timeLimitSeconds,
        headline: cleared ? "Stadium cleared" : `${occupancy} guests still inside`,
        detail: alarmSounded ? "Routing everyone to the nearest exit" : "Alarm sounds at T+5s",
        completion: alarmSounded ? 1 - Math.min(occupancy / 500, 1) : 0,
        status: cleared ? "success" : timedOut ? "failed" : "running",
      };
    }
  }
}

export function scoreChallenge(
  def: ChallengeDefinition,
  engine: SimulationEngine,
  progress: ChallengeProgress,
): ChallengeResult {
  if (progress.status !== "success") {
    return {
      challengeId: def.id,
      success: false,
      stars: 0,
      summary: "Objective not met before time ran out.",
      elapsedSeconds: progress.elapsedSeconds,
      achievedAt: Date.now(),
    };
  }

  const dangerCount = engine.metrics.getDangerEventCount(0);
  let stars: 0 | 1 | 2 | 3 = 1;
  let summary = "";

  if (def.id === "rush-hour") {
    stars = dangerCount === 0 && progress.elapsedSeconds <= 60 ? 3 : dangerCount <= 1 ? 2 : 1;
    summary = `Filled the house in ${progress.elapsedSeconds.toFixed(1)}s with ${dangerCount} alert(s).`;
  } else if (def.id === "halftime-surge") {
    const { violationSeconds } = halftimeStats(engine);
    stars = violationSeconds === 0 ? 3 : violationSeconds <= 1 ? 2 : 1;
    summary = `Held the line for 60s with ${violationSeconds}s of queues over threshold.`;
  } else {
    stars = progress.elapsedSeconds <= 45 && dangerCount === 0 ? 3 : progress.elapsedSeconds <= 60 ? 2 : 1;
    summary = `Cleared the stadium in ${progress.elapsedSeconds.toFixed(1)}s.`;
  }

  return {
    challengeId: def.id,
    success: true,
    stars,
    summary,
    elapsedSeconds: progress.elapsedSeconds,
    achievedAt: Date.now(),
  };
}
