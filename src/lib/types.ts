// src/lib/types.ts
// Central domain model for StadiumOS. Every other module imports from here —
// keep this the single source of truth for shape, never redeclare inline.

export type ZoneType =
  | "seating"
  | "entrance"
  | "exit"
  | "concession"
  | "restroom"
  | "concourse"
  | "field";

export interface Zone {
  id: string;
  label: string;
  type: ZoneType;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Max simultaneous occupants this zone can hold before it's "full". */
  capacity: number;
}

export type AgentState =
  | "entering"
  | "roaming"
  | "seated"
  | "queuing"
  | "exiting";

export interface Agent {
  id: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  /** Current zone the agent's coordinates fall inside, or null (in transit). */
  zoneId: string | null;
  /** Zone the agent is walking toward / queuing for / seated in. */
  destinationZoneId: string | null;
  state: AgentState;
  /** Units per second at reality speed multiplier 1.0. */
  baseSpeed: number;
  /** Simulation-clock timestamp (seconds) at which a stationary state ends. */
  stateEndsAt: number;
  trail: Array<{ x: number; y: number }>;
}

export type EventSeverity = "info" | "warn" | "danger";

export interface SimEvent {
  id: string;
  timestamp: number; // simulation seconds since engine start
  severity: EventSeverity;
  message: string;
  zoneId?: string;
}

export interface ZoneOccupancy {
  zoneId: string;
  occupancy: number;
  capacity: number;
  ratio: number;
}

export interface MetricSnapshot {
  timestamp: number;
  totalOccupancy: number;
  totalExited: number;
  totalSpawned: number;
  zoneOccupancy: ZoneOccupancy[];
  avgDensity: number;
  flowRate: number;
  queueLengths: Array<{ zoneId: string; length: number }>;
}

export type RealityId = "baseline" | "peak-rush" | "concert" | "evacuation";

export interface RealityConfig {
  id: RealityId;
  name: string;
  description: string;
  speedMultiplier: number;
  spawnPerSecond: number;
  maxAgents: number;
  seatBias: number; // 0..1 chance a roaming agent heads to seating vs concession/restroom
  accent: string; // CSS color used for this reality's chrome
  autoEvacuateAtSeconds: number | null; // null = never auto-trigger
}

export type ViewToggleKey = "heat" | "flow" | "zones" | "labels";

export interface ViewToggles {
  heat: boolean;
  flow: boolean;
  zones: boolean;
  labels: boolean;
}

export type ChallengeId = "rush-hour" | "halftime-surge" | "evacuation-drill";

export interface ChallengeDefinition {
  id: ChallengeId;
  title: string;
  briefing: string;
  targetReality: RealityId;
  timeLimitSeconds: number;
}

export interface ChallengeProgress {
  challengeId: ChallengeId;
  elapsedSeconds: number;
  timeLimitSeconds: number;
  headline: string;
  detail: string;
  /** 0..1, drives the progress bar. */
  completion: number;
  status: "running" | "success" | "failed";
}

export interface ChallengeResult {
  challengeId: ChallengeId;
  success: boolean;
  stars: 0 | 1 | 2 | 3;
  summary: string;
  elapsedSeconds: number;
  achievedAt: number; // Date.now()
}

export type AchievementId =
  | "sell-out"
  | "clean-sweep"
  | "zero-panic"
  | "crowd-whisperer";

export interface AchievementDefinition {
  id: AchievementId;
  title: string;
  description: string;
}
