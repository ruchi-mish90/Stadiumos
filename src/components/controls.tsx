"use client";

import { useEffect } from "react";
import type { ViewToggles, ViewToggleKey } from "@/lib/types";

interface Props {
  playing: boolean;
  onTogglePlay: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  viewMode: number;
  onViewModeChange: (mode: number) => void;
  toggles: ViewToggles;
  onToggleChange: (key: ViewToggleKey) => void;
  onEvacuate: () => void;
  onReset: () => void;
}

const TOGGLE_META: Array<{ key: ViewToggleKey; label: string; hotkey: string }> = [
  { key: "heat", label: "Heat", hotkey: "H" },
  { key: "flow", label: "Flow", hotkey: "F" },
  { key: "zones", label: "Zones", hotkey: "Z" },
  { key: "labels", label: "Labels", hotkey: "L" },
];

const MIN_SPEED = 0.25;
const MAX_SPEED = 4;
const SPEED_STEP = 0.25;

export function ControlBar({
  playing,
  onTogglePlay,
  speed,
  onSpeedChange,
  viewMode,
  onViewModeChange,
  toggles,
  onToggleChange,
  onEvacuate,
  onReset,
}: Props) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      switch (event.key) {
        case " ":
          event.preventDefault();
          onTogglePlay();
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          onViewModeChange(Number(event.key));
          break;
        case "h":
        case "H":
          onToggleChange("heat");
          break;
        case "f":
        case "F":
          onToggleChange("flow");
          break;
        case "z":
        case "Z":
          onToggleChange("zones");
          break;
        case "l":
        case "L":
          onToggleChange("labels");
          break;
        case "+":
        case "=":
          onSpeedChange(Math.min(MAX_SPEED, Math.round((speed + SPEED_STEP) * 100) / 100));
          break;
        case "-":
        case "_":
          onSpeedChange(Math.max(MIN_SPEED, Math.round((speed - SPEED_STEP) * 100) / 100));
          break;
        case "r":
        case "R":
          onReset();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onReset, onSpeedChange, onToggleChange, onTogglePlay, onViewModeChange, speed]);

  return (
    <header className="control-bar">
      <div className="control-bar__brand">
        <span className="control-bar__brand-mark">STADIUM<span>OS</span></span>
      </div>

      <div className="control-bar__group">
        <button
          type="button"
          className="btn btn--icon"
          onClick={onTogglePlay}
          aria-pressed={playing}
          title="Space"
        >
          {playing ? "Pause" : "Play"}
        </button>
        <div className="control-bar__speed">
          <input
            type="range"
            min={MIN_SPEED}
            max={MAX_SPEED}
            step={SPEED_STEP}
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            aria-label="Simulation speed"
          />
          <span>{speed.toFixed(2)}x</span>
        </div>
      </div>

      <div className="control-bar__group">
        <span className="control-bar__group-label">View</span>
        {[1, 2, 3, 4].map((mode) => (
          <button
            key={mode}
            type="button"
            className={`btn btn--chip${viewMode === mode ? " btn--chip-active" : ""}`}
            onClick={() => onViewModeChange(mode)}
            title={String(mode)}
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="control-bar__group">
        {TOGGLE_META.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn btn--chip${toggles[t.key] ? " btn--chip-active" : ""}`}
            onClick={() => onToggleChange(t.key)}
            title={t.hotkey}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="control-bar__group control-bar__group--end">
        <button type="button" className="btn btn--ghost" onClick={onReset} title="R">
          Reset
        </button>
        <button type="button" className="btn btn--danger" onClick={onEvacuate}>
          Trigger evacuation
        </button>
      </div>
    </header>
  );
}
