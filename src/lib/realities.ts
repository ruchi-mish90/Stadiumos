// src/lib/realities.ts
import type { RealityConfig, RealityId } from "./types";

export const REALITIES: RealityConfig[] = [
  {
    id: "baseline",
    name: "Baseline",
    description: "Steady pre-game flow at normal walking pace.",
    speedMultiplier: 1,
    spawnPerSecond: 2.2,
    maxAgents: 500,
    seatBias: 0.6,
    accent: "#4fd8e0",
    autoEvacuateAtSeconds: null,
  },
  {
    id: "peak-rush",
    name: "Peak Rush",
    description: "Gates just opened — high spawn rate, hurried movement.",
    speedMultiplier: 1.6,
    spawnPerSecond: 4.5,
    maxAgents: 650,
    seatBias: 0.5,
    accent: "#ffb020",
    autoEvacuateAtSeconds: null,
  },
  {
    id: "concert",
    name: "Concert",
    description: "General-admission crowd, slow drift, low seat bias.",
    speedMultiplier: 0.65,
    spawnPerSecond: 1.6,
    maxAgents: 550,
    seatBias: 0.25,
    accent: "#c792ea",
    autoEvacuateAtSeconds: null,
  },
  {
    id: "evacuation",
    name: "Evacuation",
    description: "Full house, alarm at T+5s — every agent routes to the nearest exit.",
    speedMultiplier: 1.9,
    spawnPerSecond: 0,
    maxAgents: 500,
    seatBias: 0.6,
    accent: "#ff4d4d",
    autoEvacuateAtSeconds: 5,
  },
];

export function getReality(id: RealityId): RealityConfig {
  const found = REALITIES.find((r) => r.id === id);
  if (!found) throw new Error(`Unknown reality id: ${id}`);
  return found;
}
