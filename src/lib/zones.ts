// src/lib/zones.ts
// Generates the stadium's zone geometry. Nothing here is hardcoded rect-by-rect —
// the stand layout is derived from a slot pattern so section counts, capacities,
// and pixel geometry always stay consistent with each other.

import type { Zone, ZoneType } from "./types";

export const STADIUM_WIDTH = 1000;
export const STADIUM_HEIGHT = 640;

const MARGIN_X = 30;
const STAND_HEIGHT = 170;
const CONCOURSE_HEIGHT = 25;
const GATE_HEIGHT = 45;
const GATE_WIDTH = 150;

const SEATING_CAPACITY = 40;
const CONCESSION_CAPACITY = 18;
const RESTROOM_CAPACITY = 14;
const CONCOURSE_CAPACITY = 60;

// Each stand is 12 slots wide. Concessions/restrooms sit in the middle four
// slots (closest to the concourse), seating fills the outer eight — this is
// what produces "16 seating / 4 concession / 4 restroom" across both stands.
const STAND_SLOT_PATTERN: ZoneType[] = [
  "seating",
  "seating",
  "seating",
  "seating",
  "concession",
  "restroom",
  "restroom",
  "concession",
  "seating",
  "seating",
  "seating",
  "seating",
];

function capacityFor(type: ZoneType): number {
  switch (type) {
    case "seating":
      return SEATING_CAPACITY;
    case "concession":
      return CONCESSION_CAPACITY;
    case "restroom":
      return RESTROOM_CAPACITY;
    case "concourse":
      return CONCOURSE_CAPACITY;
    default:
      return Number.MAX_SAFE_INTEGER;
  }
}

function buildStand(standY: number, prefix: string): Zone[] {
  const usableWidth = STADIUM_WIDTH - MARGIN_X * 2;
  const gap = 4;
  const slotCount = STAND_SLOT_PATTERN.length;
  const slotWidth = (usableWidth - gap * (slotCount - 1)) / slotCount;

  const counters: Partial<Record<ZoneType, number>> = {};
  const zones: Zone[] = [];

  STAND_SLOT_PATTERN.forEach((type, i) => {
    const count = (counters[type] ?? 0) + 1;
    counters[type] = count;
    const x = MARGIN_X + i * (slotWidth + gap);
    const label =
      type === "seating"
        ? `Section ${prefix}${count}`
        : type === "concession"
          ? `Concession ${prefix}${count}`
          : `Restroom ${prefix}${count}`;

    zones.push({
      id: `${prefix.toLowerCase()}-${type}-${count}`,
      label,
      type,
      x,
      y: standY,
      w: slotWidth,
      h: STAND_HEIGHT,
      capacity: capacityFor(type),
    });
  });

  return zones;
}

function buildGates(y: number, type: "entrance" | "exit"): Zone[] {
  const labels = type === "entrance" ? ["A", "B", "C"] : ["A", "B", "C"];
  const totalWidth = STADIUM_WIDTH;
  const spacing = (totalWidth - GATE_WIDTH * 3) / 4;

  return labels.map((label, i) => ({
    id: `${type}-${label.toLowerCase()}`,
    label: `${type === "entrance" ? "Entrance" : "Exit"} ${label}`,
    type,
    x: spacing + i * (GATE_WIDTH + spacing),
    y,
    w: GATE_WIDTH,
    h: GATE_HEIGHT,
    capacity: Number.MAX_SAFE_INTEGER,
  }));
}

/**
 * Builds the full, fixed 1000x640 stadium layout:
 * 3 entrances, top stand (8 seating / 2 concession / 2 restroom),
 * top concourse, field, bottom concourse,
 * bottom stand (mirrored), 3 exits.
 */
export function generateStadiumZones(): Zone[] {
  const topStandY = GATE_HEIGHT + 20;
  const topConcourseY = topStandY + STAND_HEIGHT;
  const fieldY = topConcourseY + CONCOURSE_HEIGHT;
  const fieldHeight = 120;
  const bottomConcourseY = fieldY + fieldHeight;
  const bottomStandY = bottomConcourseY + CONCOURSE_HEIGHT;
  const exitY = bottomStandY + STAND_HEIGHT + 10;

  const zones: Zone[] = [
    ...buildGates(10, "entrance"),
    ...buildStand(topStandY, "N"),
    {
      id: "concourse-north",
      label: "North Concourse",
      type: "concourse",
      x: MARGIN_X,
      y: topConcourseY,
      w: STADIUM_WIDTH - MARGIN_X * 2,
      h: CONCOURSE_HEIGHT,
      capacity: CONCOURSE_CAPACITY,
    },
    {
      id: "field",
      label: "Field",
      type: "field",
      x: STADIUM_WIDTH / 2 - 200,
      y: fieldY,
      w: 400,
      h: fieldHeight,
      capacity: 0,
    },
    {
      id: "concourse-south",
      label: "South Concourse",
      type: "concourse",
      x: MARGIN_X,
      y: bottomConcourseY,
      w: STADIUM_WIDTH - MARGIN_X * 2,
      h: CONCOURSE_HEIGHT,
      capacity: CONCOURSE_CAPACITY,
    },
    ...buildStand(bottomStandY, "S"),
    ...buildGates(exitY, "exit"),
  ];

  return zones;
}

export function zoneContains(zone: Zone, x: number, y: number): boolean {
  return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
}

/** Returns the most specific zone containing (x, y), or null if in open space. */
export function findZoneAt(zones: Zone[], x: number, y: number): Zone | null {
  // Concourse/field are large catch-alls — check them last so a point that
  // also falls inside a seating/concession/gate rect resolves to that instead.
  const priority: ZoneType[] = [
    "entrance",
    "exit",
    "seating",
    "concession",
    "restroom",
    "field",
    "concourse",
  ];
  for (const type of priority) {
    for (const zone of zones) {
      if (zone.type === type && zoneContains(zone, x, y)) return zone;
    }
  }
  return null;
}

export function zoneCenter(zone: Zone): { x: number; y: number } {
  return { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 };
}

export function randomPointIn(zone: Zone, padding = 6): { x: number; y: number } {
  const px = Math.min(padding, zone.w / 2 - 1);
  const py = Math.min(padding, zone.h / 2 - 1);
  return {
    x: zone.x + px + Math.random() * Math.max(zone.w - px * 2, 1),
    y: zone.y + py + Math.random() * Math.max(zone.h - py * 2, 1),
  };
}
