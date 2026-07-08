// src/lib/agents.ts
// Owns everything about a single agent's behavior. The simulation engine
// (simulation.ts) owns the collection and occupancy bookkeeping; this module
// stays a pure behavior layer so it's independently testable.

import type { Agent, RealityConfig, Zone, ZoneType } from "./types";
import { findZoneAt, randomPointIn, zoneCenter } from "./zones";

const AVG_SERVICE_SECONDS = 1.4;
const SEATED_DWELL_MIN = 8;
const SEATED_DWELL_MAX = 25;

let nextAgentId = 1;
export function resetAgentIdCounter(): void {
  nextAgentId = 1;
}

/** Lets the behavior layer ask "how busy is this zone right now?" without owning state. */
export type OccupancyLookup = (zoneId: string) => number;

export function spawnAgent(entranceZone: Zone, now: number): Agent {
  const spawn = randomPointIn(entranceZone, 10);
  return {
    id: nextAgentId++,
    x: spawn.x,
    y: spawn.y,
    targetX: spawn.x,
    targetY: entranceZone.y + entranceZone.h + 22,
    zoneId: entranceZone.id,
    destinationZoneId: null,
    state: "entering",
    baseSpeed: 26 + Math.random() * 10,
    stateEndsAt: now,
    trail: [],
  };
}

function pickCandidateType(seatBias: number): ZoneType {
  const roll = Math.random();
  if (roll < seatBias) return "seating";
  return roll < seatBias + (1 - seatBias) / 2 ? "concession" : "restroom";
}

/**
 * Picks a destination zone with light load-balancing: sample a few
 * same-type zones and prefer whichever is proportionally least full,
 * so agents don't all pile into the first section in the array.
 */
export function pickRoamDestination(
  zones: Zone[],
  seatBias: number,
  getOccupancy: OccupancyLookup,
  excludeZoneId: string | null,
): Zone | null {
  for (let attempt = 0; attempt < 4; attempt++) {
    const type = pickCandidateType(seatBias);
    const pool = zones.filter((z) => z.type === type && z.id !== excludeZoneId);
    if (pool.length === 0) continue;

    const sampleSize = Math.min(3, pool.length);
    let best: Zone | null = null;
    let bestRatio = Infinity;
    for (let i = 0; i < sampleSize; i++) {
      const candidate = pool[Math.floor(Math.random() * pool.length)]!;
      const ratio = getOccupancy(candidate.id) / candidate.capacity;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = candidate;
      }
    }
    if (best && bestRatio < 0.97) return best;
  }
  return null;
}

function routeToNewRoamTarget(
  agent: Agent,
  zones: Zone[],
  cfg: RealityConfig,
  getOccupancy: OccupancyLookup,
): void {
  const dest = pickRoamDestination(zones, cfg.seatBias, getOccupancy, agent.zoneId);
  if (dest) {
    agent.destinationZoneId = dest.id;
    const point = randomPointIn(dest, 8);
    agent.targetX = point.x;
    agent.targetY = point.y;
    return;
  }
  // Everything sampled was essentially full — drift to a concourse instead
  // of freezing in place. This is what keeps a packed stadium looking alive
  // rather than gridlocked.
  agent.destinationZoneId = null;
  const concourses = zones.filter((z) => z.type === "concourse");
  const fallback = concourses[Math.floor(Math.random() * concourses.length)];
  if (fallback) {
    const p = randomPointIn(fallback, 4);
    agent.targetX = p.x;
    agent.targetY = p.y;
  }
}

export function routeToNearestExit(agent: Agent, exits: Zone[]): void {
  let nearest: Zone | null = null;
  let bestDist = Infinity;
  for (const exit of exits) {
    const c = zoneCenter(exit);
    const d = Math.hypot(c.x - agent.x, c.y - agent.y);
    if (d < bestDist) {
      bestDist = d;
      nearest = exit;
    }
  }
  if (!nearest) return;
  agent.state = "exiting";
  agent.destinationZoneId = nearest.id;
  const p = randomPointIn(nearest, 10);
  agent.targetX = p.x;
  agent.targetY = p.y;
}

export interface StepResult {
  crossedZone: boolean;
  despawned: boolean;
}

function handleArrival(
  agent: Agent,
  zones: Zone[],
  cfg: RealityConfig,
  now: number,
  getOccupancy: OccupancyLookup,
  result: StepResult,
): void {
  switch (agent.state) {
    case "entering": {
      agent.state = "roaming";
      routeToNewRoamTarget(agent, zones, cfg, getOccupancy);
      break;
    }
    case "roaming": {
      const destZone = zones.find((z) => z.id === agent.destinationZoneId) ?? null;
      if (!destZone) {
        routeToNewRoamTarget(agent, zones, cfg, getOccupancy);
        break;
      }
      if (destZone.type === "seating") {
        agent.state = "seated";
        agent.stateEndsAt = now + SEATED_DWELL_MIN + Math.random() * (SEATED_DWELL_MAX - SEATED_DWELL_MIN);
      } else {
        agent.state = "queuing";
        const currentQueue = getOccupancy(destZone.id);
        agent.stateEndsAt = now + 1 + currentQueue * AVG_SERVICE_SECONDS + Math.random();
      }
      break;
    }
    case "exiting": {
      result.despawned = true;
      break;
    }
    default:
      break;
  }
}

function handleStationaryTimeout(
  agent: Agent,
  zones: Zone[],
  cfg: RealityConfig,
  now: number,
  getOccupancy: OccupancyLookup,
): void {
  if (agent.state === "seated") {
    const takesBreak = Math.random() < 0.4;
    if (takesBreak) {
      agent.state = "roaming";
      routeToNewRoamTarget(agent, zones, cfg, getOccupancy);
    } else {
      agent.stateEndsAt = now + SEATED_DWELL_MIN + Math.random() * (SEATED_DWELL_MAX - SEATED_DWELL_MIN);
    }
  } else if (agent.state === "queuing") {
    agent.state = "roaming";
    routeToNewRoamTarget(agent, zones, cfg, getOccupancy);
  }
}

/**
 * Advances one agent by `dt` seconds. Mutates the agent in place (this runs
 * for hundreds of agents per frame — allocating a fresh object per agent per
 * tick is the kind of thing that shows up in a profiler fast).
 */
export function stepAgent(
  agent: Agent,
  zones: Zone[],
  dt: number,
  now: number,
  cfg: RealityConfig,
  getOccupancy: OccupancyLookup,
): StepResult {
  const result: StepResult = { crossedZone: false, despawned: false };
  const isStationary = agent.state === "seated" || agent.state === "queuing";

  if (!isStationary) {
    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const speed = agent.baseSpeed * cfg.speedMultiplier;
      const step = Math.min(dist, speed * dt);
      agent.x += (dx / dist) * step;
      agent.y += (dy / dist) * step;
      agent.trail.push({ x: agent.x, y: agent.y });
      if (agent.trail.length > 12) agent.trail.shift();
    } else {
      handleArrival(agent, zones, cfg, now, getOccupancy, result);
    }
  } else if (now >= agent.stateEndsAt) {
    handleStationaryTimeout(agent, zones, cfg, now, getOccupancy);
  }

  const zoneNow = findZoneAt(zones, agent.x, agent.y);
  const zoneNowId = zoneNow ? zoneNow.id : null;
  if (zoneNowId !== agent.zoneId) {
    result.crossedZone = true;
    agent.zoneId = zoneNowId;
  }

  return result;
}
