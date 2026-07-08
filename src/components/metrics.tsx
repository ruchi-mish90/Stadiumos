"use client";

import { useEffect, useRef } from "react";
import type { MetricSnapshot, Zone } from "@/lib/types";

interface ComparisonRow {
  id: string;
  label: string;
  accent: string;
  occupancy: number;
  flowRate: number;
}

interface Props {
  snapshot: MetricSnapshot | null;
  buffer: readonly MetricSnapshot[];
  zones: Zone[];
  totalCapacity: number;
  comparisons?: ComparisonRow[];
}

function Sparkline({ buffer }: { buffer: readonly MetricSnapshot[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const recent = buffer.slice(-60);
    if (recent.length < 2) return;
    const max = Math.max(1, ...recent.map((s) => s.flowRate));

    ctx.beginPath();
    recent.forEach((snap, i) => {
      const x = (i / (recent.length - 1)) * width;
      const y = height - (snap.flowRate / max) * (height - 6) - 3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#4fd8e0";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = "rgba(79, 216, 224, 0.12)";
    ctx.fill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer.length, buffer[buffer.length - 1]?.timestamp]);

  return <canvas ref={canvasRef} className="sparkline" />;
}

function OccupancyGauge({ occupancy, capacity }: { occupancy: number; capacity: number }) {
  const ratio = Math.min(occupancy / capacity, 1);
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - ratio);
  const color = ratio > 0.9 ? "#ff4d4d" : ratio > 0.7 ? "#ffb020" : "#4fd8e0";

  return (
    <svg viewBox="0 0 100 100" className="gauge">
      <circle cx="50" cy="50" r="42" className="gauge__track" />
      <circle
        cx="50"
        cy="50"
        r="42"
        stroke={color}
        strokeWidth="7"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        fill="none"
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="46" textAnchor="middle" className="gauge__value">
        {occupancy}
      </text>
      <text x="50" y="63" textAnchor="middle" className="gauge__label">
        of {capacity}
      </text>
    </svg>
  );
}

const TYPE_ORDER: Zone["type"][] = ["seating", "concession", "restroom"];

export function MetricsPanel({ snapshot, buffer, zones, totalCapacity, comparisons }: Props) {
  const occupancy = snapshot?.totalOccupancy ?? 0;
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const rows = (snapshot?.zoneOccupancy ?? [])
    .filter((zo) => TYPE_ORDER.includes(zoneById.get(zo.zoneId)?.type ?? "field"))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 10);

  return (
    <aside className="metrics-panel">
      {comparisons && comparisons.length > 0 && (
        <section className="metrics-panel__section">
          <h3>Reality comparison</h3>
          <ul className="comparison-list">
            {comparisons.map((row) => (
              <li key={row.id} className="comparison-list__row">
                <span className="comparison-list__dot" style={{ background: row.accent }} />
                <span className="comparison-list__label">{row.label}</span>
                <span className="comparison-list__value">{row.occupancy}</span>
                <span className="comparison-list__value">{row.flowRate}/s</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="metrics-panel__section">
        <h3>Occupancy</h3>
        <OccupancyGauge occupancy={occupancy} capacity={totalCapacity} />
      </section>

      <section className="metrics-panel__section">
        <div className="metrics-panel__stat-row">
          <div>
            <span className="metrics-panel__stat-value">{snapshot?.flowRate ?? 0}</span>
            <span className="metrics-panel__stat-label">zone crossings / s</span>
          </div>
          <div>
            <span className="metrics-panel__stat-value">
              {snapshot ? Math.round(snapshot.avgDensity * 100) : 0}%
            </span>
            <span className="metrics-panel__stat-label">avg. density</span>
          </div>
        </div>
        <Sparkline buffer={buffer} />
      </section>

      <section className="metrics-panel__section metrics-panel__section--grow">
        <h3>Busiest zones</h3>
        <ul className="zone-list">
          {rows.map((row) => {
            const zone = zoneById.get(row.zoneId);
            if (!zone) return null;
            const pct = Math.round(row.ratio * 100);
            return (
              <li key={row.zoneId} className="zone-list__row">
                <span className="zone-list__label">{zone.label}</span>
                <div className="zone-list__bar">
                  <div
                    className="zone-list__bar-fill"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      background: pct >= 90 ? "#ff4d4d" : pct >= 70 ? "#ffb020" : "#4fd8e0",
                    }}
                  />
                </div>
                <span className="zone-list__pct">{pct}%</span>
              </li>
            );
          })}
          {rows.length === 0 && <li className="zone-list__empty">No guests yet.</li>}
        </ul>
      </section>
    </aside>
  );
}
