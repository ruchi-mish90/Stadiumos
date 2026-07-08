// src/lib/simulation.ts
// One SimulationEngine instance = one independent "reality". Dashboard.tsx
// creates 1-4 of these and drives them from a single shared rAF loop.

import { resetAgentIdCounter, routeToNearestExit, spawnAgent, stepAgent } from "./agents";
import { MetricsEngine } from "./metrics";
import type { Agent, MetricSnapshot, RealityConfig, Zone } from "./types";
import { generateStadiumZones } from "./zones";

export class SimulationEngine {
  readonly zones: Zone[];
  readonly metrics = new MetricsEngine();
  agents: Agent[] = [];
  cfg: RealityConfig;

  private clock = 0;
  private secondAccumulator = 0;
  private spawnAccumulator = 0;
  private evacuationTriggered = false;
  private readonly entrances: Zone[];
  private readonly exits: Zone[];

  latestSnapshot: MetricSnapshot | null = null;

  constructor(cfg: RealityConfig) {
    this.cfg = cfg;
    this.zones = generateStadiumZones();
    this.entrances = this.zones.filter((z) => z.type === "entrance");
    this.exits = this.zones.filter((z) => z.type === "exit");
  }

  reset(cfg: RealityConfig = this.cfg): void {
    this.cfg = cfg;
    this.agents = [];
    this.clock = 0;
    this.secondAccumulator = 0;
    this.spawnAccumulator = 0;
    this.evacuationTriggered = false;
    this.metrics.reset();
    resetAgentIdCounter();
  }

  triggerEvacuation(): void {
    if (this.evacuationTriggered) return;
    this.evacuationTriggered = true;
    for (const agent of this.agents) {
      if (agent.state !== "exiting") routeToNearestExit(agent, this.exits);
    }
  }

  get elapsedSeconds(): number {
    return this.clock;
  }

  private occupancyOf = (zoneId: string): number => {
    let count = 0;
    for (const agent of this.agents) {
      if (agent.zoneId === zoneId || agent.destinationZoneId === zoneId) count += 1;
    }
    return count;
  };

  /** Advance the simulation by `dt` real seconds (already includes global speed scaling upstream). */
  tick(dt: number): void {
    this.clock += dt;

    if (
      !this.evacuationTriggered &&
      this.cfg.autoEvacuateAtSeconds !== null &&
      this.clock >= this.cfg.autoEvacuateAtSeconds
    ) {
      this.triggerEvacuation();
    }

    if (this.cfg.spawnPerSecond > 0 && this.agents.length < this.cfg.maxAgents) {
      this.spawnAccumulator += dt * this.cfg.spawnPerSecond;
      while (this.spawnAccumulator >= 1 && this.agents.length < this.cfg.maxAgents) {
        const entrance = this.entrances[Math.floor(Math.random() * this.entrances.length)];
        if (entrance) {
          this.agents.push(spawnAgent(entrance, this.clock));
          this.metrics.recordSpawn();
        }
        this.spawnAccumulator -= 1;
      }
    }

    const survivors: Agent[] = [];
    for (const agent of this.agents) {
      const result = stepAgent(agent, this.zones, dt, this.clock, this.cfg, this.occupancyOf);
      if (result.crossedZone) this.metrics.recordCrossing();
      if (result.despawned) {
        this.metrics.recordExit();
        continue;
      }
      survivors.push(agent);
    }
    this.agents = survivors;

    this.secondAccumulator += dt;
    if (this.secondAccumulator >= 1) {
      this.secondAccumulator -= 1;
      this.latestSnapshot = this.metrics.snapshot(this.clock, this.agents, this.zones);
    }
  }
}
