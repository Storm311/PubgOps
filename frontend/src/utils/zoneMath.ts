/** Blue zone / white circle state at a replay time (pure, unit-tested). */

import { lerp } from "./replayMath";

/** Circle in the shared 0–1000 map space. */
export interface ZoneCircle {
  x: number;
  y: number;
  r: number;
}

export interface ZonePhase {
  phase: number;
  /** Target circle the blue zone shrinks to. */
  white: ZoneCircle;
  appear_t: number;
  shrink_start_t: number | null;
  shrink_end_t: number | null;
  /** Blue zone damage per second during this phase. */
  dps: number | null;
}

export interface RedZone extends ZoneCircle {
  start_t: number;
  end_t: number;
}

export interface ZoneTimeline {
  initial: ZoneCircle;
  phases: ZonePhase[];
  red_zones: RedZone[];
}

export type ZoneStatus = "pre" | "waiting" | "shrinking" | "closed";

export interface ZoneState {
  /** 0 before the first circle is announced. */
  phase: number;
  status: ZoneStatus;
  blue: ZoneCircle;
  white: ZoneCircle | null;
  /** Seconds until the shrink starts (waiting) or ends (shrinking). */
  countdown: number | null;
  dps: number | null;
  redZones: ZoneCircle[];
}

const lerpCircle = (a: ZoneCircle, b: ZoneCircle, u: number): ZoneCircle => ({
  x: lerp(a.x, b.x, u),
  y: lerp(a.y, b.y, u),
  r: lerp(a.r, b.r, u),
});

export function zoneAt(timeline: ZoneTimeline, t: number): ZoneState {
  const redZones = timeline.red_zones.filter((z) => z.start_t <= t && t < z.end_t);

  let idx = -1;
  for (let i = 0; i < timeline.phases.length; i++) {
    if (timeline.phases[i].appear_t <= t) idx = i;
    else break;
  }
  if (idx < 0) {
    return {
      phase: 0,
      status: "pre",
      blue: timeline.initial,
      white: null,
      countdown: null,
      dps: null,
      redZones,
    };
  }

  const current = timeline.phases[idx];
  const from = idx > 0 ? timeline.phases[idx - 1].white : timeline.initial;
  const { shrink_start_t: start, shrink_end_t: end } = current;
  const base = { phase: current.phase, white: current.white, dps: current.dps, redZones };

  if (start === null || t < start) {
    return {
      ...base,
      status: "waiting",
      blue: from,
      countdown: start === null ? null : start - t,
    };
  }
  if (end === null) {
    // Shrink start known but end never observed (match ended mid-shrink without a fit).
    return { ...base, status: "shrinking", blue: from, countdown: null };
  }
  if (t < end) {
    const u = end > start ? (t - start) / (end - start) : 1;
    return {
      ...base,
      status: "shrinking",
      blue: lerpCircle(from, current.white, u),
      countdown: end - t,
    };
  }
  return { ...base, status: "closed", blue: current.white, countdown: null };
}
