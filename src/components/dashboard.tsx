"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ControlBar } from "./controls";
import { MetricsPanel } from "./metrics";
import { StadiumCanvas, type StadiumCanvasHandle } from "./stadium";
import { ChallengePanel } from "./challenge-panel";
import { SimulationEngine } from "@/lib/simulation";
import { REALITIES, getReality } from "@/lib/realities";
import { evaluateChallenge, getChallenge, scoreChallenge } from "@/lib/challenges";
import { checkLiveAchievements, checkResultAchievements } from "@/lib/achievements";
import { loadBestScores, loadUnlockedAchievements, saveBestScore, unlockAchievements, type BestScores } from "@/lib/storage";
import type {
  AchievementId,
  ChallengeId,
  ChallengeProgress,
  ChallengeResult,
  MetricSnapshot,
  RealityId,
  SimEvent,
  ViewToggleKey,
  ViewToggles,
} from "@/lib/types";

const MAX_DT = 1 / 15; // clamp so a dropped/backgrounded frame can't cause a huge simulation jump
const SEATING_CONCESSION_RESTROOM_CAPACITY = 16 * 40 + 4 * 18 + 4 * 14; // matches zones.ts constants

export function Dashboard() {
  const enginesRef = useRef<Map<RealityId, SimulationEngine> | null>(null);
  if (!enginesRef.current) {
    enginesRef.current = new Map(REALITIES.map((cfg) => [cfg.id, new SimulationEngine(cfg)]));
  }
  const engines = enginesRef.current;

  const canvasRefs = useRef<Map<RealityId, StadiumCanvasHandle | null>>(new Map());

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [viewMode, setViewMode] = useState(1);
  const [toggles, setToggles] = useState<ViewToggles>({ heat: true, flow: true, zones: true, labels: false });

  const [snapshots, setSnapshots] = useState<Partial<Record<RealityId, MetricSnapshot | null>>>({});
  const lastSnapshotRefs = useRef<Partial<Record<RealityId, MetricSnapshot | null>>>({});
  const [eventLog, setEventLog] = useState<Array<SimEvent & { realityLabel: string }>>([]);

  const [activeChallengeId, setActiveChallengeId] = useState<ChallengeId | null>(null);
  const [progress, setProgress] = useState<ChallengeProgress | null>(null);
  const [lastResult, setLastResult] = useState<ChallengeResult | null>(null);
  const [bestScores, setBestScores] = useState<BestScores>({});
  const [unlocked, setUnlocked] = useState<AchievementId[]>([]);

  useEffect(() => {
    setBestScores(loadBestScores());
    setUnlocked(loadUnlockedAchievements());
  }, []);

  const visibleRealityIds = useMemo<RealityId[]>(() => {
    if (activeChallengeId) return [getChallenge(activeChallengeId).targetReality];
    return REALITIES.slice(0, viewMode).map((r) => r.id);
  }, [activeChallengeId, viewMode]);

  const knownEventIds = useRef(new Set<string>());

  const handleReset = useCallback(() => {
    for (const id of visibleRealityIds) {
      engines.get(id)?.reset(getReality(id));
    }
    knownEventIds.current.clear();
    lastSnapshotRefs.current = {};
    setEventLog([]);
    setSnapshots({});
    if (activeChallengeId) {
      setActiveChallengeId(null);
      setProgress(null);
    }
  }, [activeChallengeId, engines, visibleRealityIds]);

  const handleEvacuate = useCallback(() => {
    for (const id of visibleRealityIds) {
      engines.get(id)?.triggerEvacuation();
    }
  }, [engines, visibleRealityIds]);

  const handleToggleChange = useCallback((key: ViewToggleKey) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleViewModeChange = useCallback((mode: number) => {
    if (activeChallengeId) return; // a running challenge owns the view
    setViewMode(mode);
  }, [activeChallengeId]);

  const handleStartChallenge = useCallback(
    (id: ChallengeId) => {
      const def = getChallenge(id);
      const engine = engines.get(def.targetReality);
      if (!engine) return;
      engine.reset(getReality(def.targetReality));
      knownEventIds.current.clear();
      setEventLog([]);
      setActiveChallengeId(id);
      setLastResult(null);
      setProgress(null);
      setPlaying(true);
    },
    [engines],
  );

  const finishChallenge = useCallback(
    (id: ChallengeId, finalProgress: ChallengeProgress) => {
      const def = getChallenge(id);
      const engine = engines.get(def.targetReality);
      if (!engine) return;
      const result = scoreChallenge(def, engine, finalProgress);
      setLastResult(result);
      setActiveChallengeId(null);
      setProgress(null);

      const nextBest = saveBestScore(result.challengeId, result.stars, result.elapsedSeconds);
      setBestScores(nextBest);

      const dangerCount = engine.metrics.getDangerEventCount(0);
      const bestStarsMap = Object.fromEntries(
        Object.entries(nextBest).map(([k, v]) => [k, v?.stars ?? 0]),
      ) as Record<string, number>;
      const newlyUnlocked = checkResultAchievements(result, dangerCount, bestStarsMap);
      if (newlyUnlocked.length > 0) setUnlocked(unlockAchievements(newlyUnlocked));
    },
    [engines],
  );

  // ---- The single shared simulation + render loop ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dtReal = Math.min((now - last) / 1000, MAX_DT * 4);
      last = now;

      if (playing) {
        const dtSim = Math.min(dtReal * speed, MAX_DT * speed);
        for (const id of visibleRealityIds) {
          engines.get(id)?.tick(dtSim);
        }
      }

      for (const id of visibleRealityIds) {
        canvasRefs.current.get(id)?.draw();
      }

      // A new MetricSnapshot object is only created once per simulated second
      // (see MetricsEngine.snapshot). Comparing that reference is enough to
      // know whether a visible reality actually has fresh data this frame —
      // no need to diff the whole object at 60fps.
      let snapshotsChanged = false;
      const newEvents: Array<SimEvent & { realityLabel: string }> = [];
      for (const id of visibleRealityIds) {
        const engine = engines.get(id);
        if (!engine) continue;
        if (engine.latestSnapshot !== lastSnapshotRefs.current[id]) {
          lastSnapshotRefs.current[id] = engine.latestSnapshot;
          snapshotsChanged = true;
          if (engine.latestSnapshot) {
            const unlockedLive = checkLiveAchievements(engine.latestSnapshot);
            if (unlockedLive.length > 0) unlockAchievements(unlockedLive);
          }
        }
        for (const evt of engine.metrics.getEvents()) {
          if (!knownEventIds.current.has(evt.id)) {
            knownEventIds.current.add(evt.id);
            newEvents.push({ ...evt, realityLabel: getReality(id).name });
          }
        }
      }

      if (snapshotsChanged) {
        setSnapshots(() => {
          const merged: Partial<Record<RealityId, MetricSnapshot | null>> = {};
          for (const id of visibleRealityIds) merged[id] = engines.get(id)?.latestSnapshot ?? null;
          return merged;
        });
      }
      if (newEvents.length > 0) {
        setEventLog((prev) => [...newEvents, ...prev].slice(0, 40));
      }

      if (activeChallengeId) {
        const def = getChallenge(activeChallengeId);
        const engine = engines.get(def.targetReality);
        if (engine) {
          const live = evaluateChallenge(def, engine);
          setProgress(live);
          if (live.status !== "running") {
            finishChallenge(activeChallengeId, live);
          }
        }
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [activeChallengeId, engines, finishChallenge, playing, speed, visibleRealityIds]);

  const primaryId = visibleRealityIds[0] ?? "baseline";
  const primaryEngine = engines.get(primaryId)!;
  const primarySnapshot = snapshots[primaryId] ?? null;

  const comparisons = visibleRealityIds.slice(1).map((id) => {
    const cfg = getReality(id);
    const snap = snapshots[id];
    return {
      id,
      label: cfg.name,
      accent: cfg.accent,
      occupancy: snap?.totalOccupancy ?? 0,
      flowRate: snap?.flowRate ?? 0,
    };
  });

  return (
    <div className="dashboard">
      <ControlBar
        playing={playing}
        onTogglePlay={() => setPlaying((p) => !p)}
        speed={speed}
        onSpeedChange={setSpeed}
        viewMode={activeChallengeId ? 1 : viewMode}
        onViewModeChange={handleViewModeChange}
        toggles={toggles}
        onToggleChange={handleToggleChange}
        onEvacuate={handleEvacuate}
        onReset={handleReset}
      />

      <div className="dashboard__main">
        <div className={`stadium-grid stadium-grid--${visibleRealityIds.length}`}>
          {visibleRealityIds.map((id) => {
            const cfg = getReality(id);
            return (
              <StadiumCanvas
                key={id}
                ref={(handle) => {
                  canvasRefs.current.set(id, handle);
                }}
                engine={engines.get(id)!}
                toggles={toggles}
                accent={cfg.accent}
                label={cfg.name}
                occupancy={snapshots[id]?.totalOccupancy ?? 0}
                compact={visibleRealityIds.length > 1}
              />
            );
          })}
        </div>

        <div className="dashboard__side">
          <MetricsPanel
            snapshot={primarySnapshot}
            buffer={primaryEngine.metrics.getBuffer()}
            zones={primaryEngine.zones}
            totalCapacity={SEATING_CONCESSION_RESTROOM_CAPACITY}
            comparisons={comparisons}
          />
          <ChallengePanel
            activeChallengeId={activeChallengeId}
            progress={progress}
            lastResult={lastResult}
            bestScores={bestScores}
            unlockedAchievements={unlocked}
            onStart={handleStartChallenge}
            onDismissResult={() => setLastResult(null)}
          />
        </div>
      </div>

      <footer className="event-ticker" aria-live="polite">
        {eventLog.length === 0 ? (
          <span className="event-ticker__empty">No incidents reported.</span>
        ) : (
          <ul>
            {eventLog.map((evt) => (
              <li key={evt.id} className={`event-ticker__item event-ticker__item--${evt.severity}`}>
                <span className="event-ticker__time">T+{evt.timestamp.toFixed(0)}s</span>
                <span className="event-ticker__reality">{evt.realityLabel}</span>
                <span>{evt.message}</span>
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}
