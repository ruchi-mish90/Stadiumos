"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Agent, Zone, ZoneType } from "@/lib/types";
import type { SimulationEngine } from "@/lib/simulation";
import { findZoneAt, STADIUM_HEIGHT, STADIUM_WIDTH } from "@/lib/zones";
import type { ViewToggles } from "@/lib/types";

export interface StadiumCanvasHandle {
  draw: () => void;
}

interface Props {
  engine: SimulationEngine;
  toggles: ViewToggles;
  accent: string;
  label: string;
  occupancy: number;
  compact: boolean;
}

const ZONE_FILL: Record<ZoneType, string> = {
  seating: "rgba(79, 216, 224, 0.10)",
  entrance: "rgba(95, 217, 122, 0.16)",
  exit: "rgba(255, 77, 77, 0.14)",
  concession: "rgba(255, 176, 32, 0.14)",
  restroom: "rgba(199, 146, 234, 0.14)",
  concourse: "rgba(255, 255, 255, 0.03)",
  field: "rgba(95, 217, 122, 0.05)",
};

const ZONE_STROKE: Record<ZoneType, string> = {
  seating: "rgba(79, 216, 224, 0.35)",
  entrance: "rgba(95, 217, 122, 0.55)",
  exit: "rgba(255, 77, 77, 0.55)",
  concession: "rgba(255, 176, 32, 0.5)",
  restroom: "rgba(199, 146, 234, 0.5)",
  concourse: "rgba(255, 255, 255, 0.08)",
  field: "rgba(95, 217, 122, 0.25)",
};

const AGENT_COLOR: Record<Agent["state"], string> = {
  entering: "#5fd97a",
  roaming: "#e8f0f0",
  seated: "#4fd8e0",
  queuing: "#ffb020",
  exiting: "#ff4d4d",
};

const HEAT_CELL = 40;
const HEAT_COLS = Math.ceil(STADIUM_WIDTH / HEAT_CELL);
const HEAT_ROWS = Math.ceil(STADIUM_HEIGHT / HEAT_CELL);

function heatColor(intensity: number): string {
  // 0 -> transparent, ramps cyan -> amber -> red as a cell fills up.
  if (intensity <= 0) return "rgba(0,0,0,0)";
  const t = Math.min(intensity, 1);
  if (t < 0.5) {
    const k = t / 0.5;
    return `rgba(${79 + k * (255 - 79)}, ${216 - k * (216 - 176)}, ${224 - k * (224 - 32)}, ${0.08 + t * 0.25})`;
  }
  const k = (t - 0.5) / 0.5;
  return `rgba(${255}, ${176 - k * 176}, ${32 - k * 32}, ${0.2 + t * 0.35})`;
}

export const StadiumCanvas = forwardRef<StadiumCanvasHandle, Props>(function StadiumCanvas(
  { engine, toggles, accent, label, occupancy, compact },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dprRef = useRef(1);
  const [hoverZone, setHoverZone] = useState<Zone | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dprRef.current = dpr;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = dprRef.current;
    const scale = Math.min(canvas.width / dpr / STADIUM_WIDTH, canvas.height / dpr / STADIUM_HEIGHT);
    const offsetX = (canvas.width / dpr - STADIUM_WIDTH * scale) / 2;
    const offsetY = (canvas.height / dpr - STADIUM_HEIGHT * scale) / 2;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Backdrop grid — the "tactical console" texture.
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= STADIUM_WIDTH; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, STADIUM_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y <= STADIUM_HEIGHT; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(STADIUM_WIDTH, y);
      ctx.stroke();
    }

    if (toggles.zones) {
      for (const zone of engine.zones) {
        ctx.fillStyle = ZONE_FILL[zone.type];
        ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
        ctx.strokeStyle = ZONE_STROKE[zone.type];
        ctx.lineWidth = zone === hoverZone ? 2 : 1;
        ctx.strokeRect(zone.x + 0.5, zone.y + 0.5, zone.w - 1, zone.h - 1);
        if (toggles.labels && !compact && (zone.w > 60 || zone.type === "entrance" || zone.type === "exit")) {
          ctx.fillStyle = "rgba(232,240,240,0.55)";
          ctx.font = "9px 'IBM Plex Mono', monospace";
          ctx.textAlign = "center";
          ctx.fillText(zone.label, zone.x + zone.w / 2, zone.y + zone.h / 2 + 3, zone.w - 4);
        }
      }
    }

    if (toggles.heat) {
      const grid = new Float32Array(HEAT_COLS * HEAT_ROWS);
      for (const agent of engine.agents) {
        const col = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor(agent.x / HEAT_CELL)));
        const row = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor(agent.y / HEAT_CELL)));
        grid[row * HEAT_COLS + col] = (grid[row * HEAT_COLS + col] ?? 0) + 1;
      }
      for (let row = 0; row < HEAT_ROWS; row++) {
        for (let col = 0; col < HEAT_COLS; col++) {
          const count = grid[row * HEAT_COLS + col] ?? 0;
          if (count === 0) continue;
          ctx.fillStyle = heatColor(count / 8);
          ctx.fillRect(col * HEAT_CELL, row * HEAT_CELL, HEAT_CELL, HEAT_CELL);
        }
      }
    }

    if (toggles.flow) {
      ctx.lineWidth = 1;
      for (const agent of engine.agents) {
        if (agent.trail.length < 2) continue;
        ctx.strokeStyle = `${AGENT_COLOR[agent.state]}33`;
        ctx.beginPath();
        ctx.moveTo(agent.trail[0]!.x, agent.trail[0]!.y);
        for (let i = 1; i < agent.trail.length; i++) {
          ctx.lineTo(agent.trail[i]!.x, agent.trail[i]!.y);
        }
        ctx.stroke();
      }
    }

    for (const agent of engine.agents) {
      ctx.fillStyle = AGENT_COLOR[agent.state];
      ctx.beginPath();
      ctx.arc(agent.x, agent.y, agent.state === "seated" ? 2 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Signature element: a rotating radar sweep tying the console theme together.
    const cx = STADIUM_WIDTH / 2;
    const cy = STADIUM_HEIGHT / 2;
    const sweepRadius = Math.hypot(STADIUM_WIDTH, STADIUM_HEIGHT) / 2;
    const angle = ((performance.now() / 4200) % 1) * Math.PI * 2;
    const trailSteps = 26;
    for (let i = 0; i < trailSteps; i++) {
      const a = angle - (i / trailSteps) * 0.9;
      const alpha = (1 - i / trailSteps) * 0.05;
      ctx.strokeStyle = hexToRgba(accent, alpha);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * sweepRadius, cy + Math.sin(a) * sweepRadius);
      ctx.stroke();
    }

    if (hoverZone && hoverPos) {
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [accent, compact, engine, hoverPos, hoverZone, toggles]);

  useImperativeHandle(ref, () => ({ draw }), [draw]);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const scale = Math.min(rect.width / STADIUM_WIDTH, rect.height / STADIUM_HEIGHT);
      const offsetX = (rect.width - STADIUM_WIDTH * scale) / 2;
      const offsetY = (rect.height - STADIUM_HEIGHT * scale) / 2;
      const localX = (event.clientX - rect.left - offsetX) / scale;
      const localY = (event.clientY - rect.top - offsetY) / scale;
      const zone = findZoneAt(engine.zones, localX, localY);
      setHoverZone(zone);
      setHoverPos(zone ? { x: localX, y: localY } : null);
    },
    [engine.zones],
  );

  return (
    <div className={`stadium-panel${compact ? " stadium-panel--compact" : ""}`}>
      <div className="stadium-panel__header">
        <span className="stadium-panel__dot" style={{ background: accent }} />
        <span className="stadium-panel__label">{label}</span>
        <span className="stadium-panel__occupancy">{occupancy} in venue</span>
      </div>
      <div className="stadium-panel__canvas-wrap" ref={containerRef}>
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverZone(null)}
        />
        {hoverZone && (
          <div className="zone-tooltip" style={{ left: 12, top: 12 }}>
            <strong>{hoverZone.label}</strong>
            <span>{hoverZone.type}</span>
            {hoverZone.capacity < Number.MAX_SAFE_INTEGER && (
              <span>capacity {hoverZone.capacity}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
