// src/lib/metrics.ts
import type { Agent, MetricSnapshot, SimEvent, Zone, ZoneOccupancy } from "./types";

const BUFFER_SECONDS = 120;
const ZONE_FULL_RATIO = 0.9;
const ZONE_EVENT_COOLDOWN = 15;
const BOTTLENECK_CONSECUTIVE_HITS = 3;
const BOTTLENECK_EVENT_COOLDOWN = 20;

let eventSeq = 0;

/**
 * Computes per-second metric snapshots for one reality's simulation and
 * raises threshold-crossing events with cooldowns/hysteresis so a zone
 * hovering at 90% doesn't spam one event per tick.
 */
export class MetricsEngine {
  private buffer: MetricSnapshot[] = [];
  private events: SimEvent[] = [];
  private crossingsSinceLastSnapshot = 0;
  private zoneEventCooldowns = new Map<string, number>();
  private bottleneckStreak = new Map<string, number>();
  private totalExited = 0;
  private totalSpawned = 0;

  recordCrossing(): void {
    this.crossingsSinceLastSnapshot += 1;
  }

  recordSpawn(): void {
    this.totalSpawned += 1;
  }

  recordExit(): void {
    this.totalExited += 1;
  }

  /** Call once per simulated second. Returns the new snapshot. */
  snapshot(now: number, agents: Agent[], zones: Zone[]): MetricSnapshot {
    const occupancyByZone = new Map<string, number>();
    for (const agent of agents) {
      if (!agent.zoneId) continue;
      occupancyByZone.set(agent.zoneId, (occupancyByZone.get(agent.zoneId) ?? 0) + 1);
    }

    const queueByZone = new Map<string, number>();
    for (const agent of agents) {
      if (agent.state !== "queuing" || !agent.destinationZoneId) continue;
      queueByZone.set(agent.destinationZoneId, (queueByZone.get(agent.destinationZoneId) ?? 0) + 1);
    }

    const zoneOccupancy: ZoneOccupancy[] = [];
    let densitySum = 0;
    let densityCount = 0;

    for (const zone of zones) {
      if (zone.type === "field") continue;
      const occupancy = occupancyByZone.get(zone.id) ?? 0;
      const capacity = zone.capacity;
      const ratio = capacity > 0 ? occupancy / capacity : 0;
      zoneOccupancy.push({ zoneId: zone.id, occupancy, capacity, ratio });

      if (zone.type === "seating" || zone.type === "concession" || zone.type === "restroom") {
        densitySum += ratio;
        densityCount += 1;
        this.checkZoneFullEvent(zone, ratio, now);
      }
      if (zone.type === "concourse") {
        this.checkBottleneckEvent(zone, occupancy, now);
      }
    }

    const snapshot: MetricSnapshot = {
      timestamp: now,
      totalOccupancy: agents.length,
      totalExited: this.totalExited,
      totalSpawned: this.totalSpawned,
      zoneOccupancy,
      avgDensity: densityCount > 0 ? densitySum / densityCount : 0,
      flowRate: this.crossingsSinceLastSnapshot,
      queueLengths: Array.from(queueByZone.entries()).map(([zoneId, length]) => ({ zoneId, length })),
    };

    this.crossingsSinceLastSnapshot = 0;
    this.buffer.push(snapshot);
    if (this.buffer.length > BUFFER_SECONDS) this.buffer.shift();
    return snapshot;
  }

  private checkZoneFullEvent(zone: Zone, ratio: number, now: number): void {
    const cooldownUntil = this.zoneEventCooldowns.get(zone.id) ?? 0;
    if (ratio >= ZONE_FULL_RATIO && now >= cooldownUntil) {
      this.pushEvent(now, "warn", `${zone.label} at ${Math.round(ratio * 100)}% capacity`, zone.id);
      this.zoneEventCooldowns.set(zone.id, now + ZONE_EVENT_COOLDOWN);
    }
  }

  private checkBottleneckEvent(zone: Zone, occupancy: number, now: number): void {
    const isCongested = occupancy >= zone.capacity;
    const streak = isCongested ? (this.bottleneckStreak.get(zone.id) ?? 0) + 1 : 0;
    this.bottleneckStreak.set(zone.id, streak);

    const cooldownUntil = this.zoneEventCooldowns.get(`bottleneck:${zone.id}`) ?? 0;
    if (streak >= BOTTLENECK_CONSECUTIVE_HITS && now >= cooldownUntil) {
      this.pushEvent(now, "danger", `Bottleneck detected at ${zone.label}`, zone.id);
      this.zoneEventCooldowns.set(`bottleneck:${zone.id}`, now + BOTTLENECK_EVENT_COOLDOWN);
    }
  }

  private pushEvent(timestamp: number, severity: SimEvent["severity"], message: string, zoneId?: string): void {
    eventSeq += 1;
    this.events.push({ id: `evt-${eventSeq}`, timestamp, severity, message, zoneId });
    if (this.events.length > 200) this.events.shift();
  }

  getBuffer(): readonly MetricSnapshot[] {
    return this.buffer;
  }

  getEvents(): readonly SimEvent[] {
    return this.events;
  }

  getDangerEventCount(sinceSeconds = 0): number {
    return this.events.filter((e) => e.severity === "danger" && e.timestamp >= sinceSeconds).length;
  }

  reset(): void {
    this.buffer = [];
    this.events = [];
    this.crossingsSinceLastSnapshot = 0;
    this.zoneEventCooldowns.clear();
    this.bottleneckStreak.clear();
    this.totalExited = 0;
    this.totalSpawned = 0;
  }
}
