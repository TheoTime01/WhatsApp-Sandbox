"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const iso = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const parse = (s: string) => new Date(`${s}T00:00:00Z`);
const diffDays = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);

export type RangeValue = { "start-date"?: string; "end-date"?: string };
type Props = {
  mode: "single" | "range"; value: string | RangeValue | undefined; onChange: (v: string | RangeValue) => void;
  min?: string; max?: string; unavailable?: string[]; includeDays?: string[]; minDays?: number; maxDays?: number; disabled?: boolean;
};

export function Calendar({ mode, value, onChange, min, max, unavailable = [], includeDays = DAYS, minDays, maxDays, disabled }: Props) {
  const seed = (typeof value === "string" ? value : value?.["start-date"]) || min || iso(new Date());
  const [cursor, setCursor] = useState(() => { const d = parse(seed); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); });
  const year = cursor.getUTCFullYear(), month = cursor.getUTCMonth();
  const first = (cursor.getUTCDay() + 6) % 7; // Monday first
  const count = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => iso(new Date(Date.UTC(year, month, i + 1))))];
  const range = typeof value === "object" ? value : {};
  const start = range["start-date"], end = range["end-date"];

  const allowed = (d: string) => {
    if (min && d < min) return false; if (max && d > max) return false;
    if (unavailable.includes(d)) return false;
    if (!includeDays.includes(DAYS[(parse(d).getUTCDay() + 6) % 7])) return false;
    if (mode === "range" && start && !end) {
      const n = diffDays(start, d);
      if (n < 0) return true; // picking a new start
      if (minDays !== undefined && n + 1 < minDays) return false;
      if (maxDays !== undefined && n + 1 > maxDays) return false;
    }
    return true;
  };
  const pick = (d: string) => {
    if (disabled || !allowed(d)) return;
    if (mode === "single") return onChange(d);
    if (!start || end || d < start) return onChange({ "start-date": d });
    onChange({ "start-date": start, "end-date": d });
  };
  const inRange = (d: string) => Boolean(start && end && d > start && d < end);

  return <div className="cal">
    <div className="cal-head">
      <button type="button" onClick={() => setCursor(new Date(Date.UTC(year, month - 1, 1)))} aria-label="Previous month"><ChevronLeft size={16} /></button>
      <strong>{cursor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</strong>
      <button type="button" onClick={() => setCursor(new Date(Date.UTC(year, month + 1, 1)))} aria-label="Next month"><ChevronRight size={16} /></button>
    </div>
    <div className="cal-grid">{DAYS.map((d) => <span key={d} className="cal-dow">{d[0]}</span>)}
      {cells.map((d, i) => d === null ? <span key={i} /> :
        <button type="button" key={d} disabled={disabled || !allowed(d)} onClick={() => pick(d)}
          className={`cal-day ${d === value || d === start || d === end ? "sel" : ""} ${inRange(d) ? "mid" : ""}`} aria-label={d}>{Number(d.slice(8))}</button>)}
    </div>
    {mode === "range" && <small className="cal-hint">{start ? `${start}${end ? ` → ${end}` : " → pick an end date"}` : "Pick a start date"}</small>}
  </div>;
}
