"""Blue zone / white circle / red zone timeline reconstructed from PUBG telemetry.

How the zone works (as recorded in telemetry):

- ``LogGameStatePeriodic`` (~every 10 s) carries ``gameState`` with:
  - ``safetyZonePosition`` / ``safetyZoneRadius`` — the *blue zone*: the current playable
    circle; outside it players take blue zone damage.
  - ``poisonGasWarningPosition`` / ``poisonGasWarningRadius`` — the *white circle*: where the
    blue zone will shrink to next (radius 0 until the first circle is announced).
  - ``redZonePosition`` / ``redZoneRadius`` — active red zone bombardment area (0 if none).
- Each phase N has two stages, mirrored by ``common.isGame``: N = white circle shown and the
  blue zone waits; N.5 = the blue zone shrinks. The shrink is linear in both center and
  radius, and ends exactly on the white circle — at which point phase N+1's white circle
  appears.
- Blue zone damage ticks once per second (``LogPlayerTakeDamage`` with
  ``damageTypeCategory == "Damage_BlueZone"``) and gets stronger every phase.

Periodic samples are only every ~10 s, so shrink start/end times are recovered exactly by
fitting the (linear) radius over the shrinking samples. All times use the same
``elapsedTime`` clock as player tracks; positions/radii use the same 0–1000 map space.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

# Two circles closer than this (in raw world units, i.e. cm) count as the same circle.
_SAME_CIRCLE_EPS = 5.0


@dataclass
class Circle:
    x: float
    y: float
    r: float

    def same_as(self, other: Optional["Circle"]) -> bool:
        return (
            other is not None
            and abs(self.x - other.x) <= _SAME_CIRCLE_EPS
            and abs(self.y - other.y) <= _SAME_CIRCLE_EPS
            and abs(self.r - other.r) <= _SAME_CIRCLE_EPS
        )

    def normalized(self, scale: float) -> Dict[str, float]:
        return {
            "x": round(self.x / scale * 1000, 3),
            "y": round(self.y / scale * 1000, 3),
            "r": round(self.r / scale * 1000, 3),
        }


@dataclass
class _Sample:
    t: float
    blue: Circle
    white: Optional[Circle]
    red: Optional[Circle]


@dataclass
class ZonePhase:
    phase: int
    white: Circle
    appear_t: float
    shrink_start_t: Optional[float] = None
    shrink_end_t: Optional[float] = None
    dps: Optional[float] = None


@dataclass
class RedZone:
    circle: Circle
    start_t: float
    end_t: float


@dataclass
class ZoneTimeline:
    initial: Circle
    phases: List[ZonePhase] = field(default_factory=list)
    red_zones: List[RedZone] = field(default_factory=list)

    def to_dict(self, scale: float) -> Dict[str, Any]:
        return {
            "initial": self.initial.normalized(scale),
            "phases": [
                {
                    "phase": p.phase,
                    "white": p.white.normalized(scale),
                    "appear_t": _round_t(p.appear_t),
                    "shrink_start_t": _round_t(p.shrink_start_t),
                    "shrink_end_t": _round_t(p.shrink_end_t),
                    "dps": p.dps,
                }
                for p in self.phases
            ],
            "red_zones": [
                {
                    **z.circle.normalized(scale),
                    "start_t": _round_t(z.start_t),
                    "end_t": _round_t(z.end_t),
                }
                for z in self.red_zones
            ],
        }


def _round_t(t: Optional[float]) -> Optional[float]:
    return None if t is None else round(t, 2)


def _circle(state: dict, prefix: str) -> Optional[Circle]:
    pos = state.get(f"{prefix}Position") or {}
    r = float(state.get(f"{prefix}Radius") or 0)
    if r <= 0:
        return None
    return Circle(float(pos.get("x", 0)), float(pos.get("y", 0)), r)


def _samples(telemetry_data: List[dict]) -> List[_Sample]:
    out: List[_Sample] = []
    for event in telemetry_data:
        if event.get("_T") != "LogGameStatePeriodic":
            continue
        state = event.get("gameState")
        if not isinstance(state, dict) or "elapsedTime" not in state:
            continue
        blue = _circle(state, "safetyZone")
        if blue is None:
            continue
        out.append(
            _Sample(
                t=float(state["elapsedTime"]),
                blue=blue,
                white=_circle(state, "poisonGasWarning"),
                red=_circle(state, "redZone"),
            )
        )
    out.sort(key=lambda s: s.t)
    return out


def _stage_starts(telemetry_data: List[dict]) -> Dict[float, float]:
    """First elapsedTime at which each ``isGame`` stage (1, 1.5, 2, …) was observed.

    Fallback timing when there are too few periodic samples to fit a shrink.
    """
    starts: Dict[float, float] = {}
    for event in telemetry_data:
        t = event.get("elapsedTime")
        if t is None and isinstance(event.get("gameState"), dict):
            t = event["gameState"].get("elapsedTime")
        stage = (event.get("common") or {}).get("isGame")
        if t is None or stage is None:
            continue
        key = round(float(stage), 1)
        if key not in starts or float(t) < starts[key]:
            starts[key] = float(t)
    return starts


def _zone_dps_by_phase(telemetry_data: List[dict]) -> Dict[int, float]:
    """Most common blue zone damage tick (1 tick/s) per phase; isGame N and N.5 → phase N."""
    ticks: Dict[int, Counter] = {}
    for event in telemetry_data:
        if event.get("_T") != "LogPlayerTakeDamage":
            continue
        if event.get("damageTypeCategory") != "Damage_BlueZone":
            continue
        stage = (event.get("common") or {}).get("isGame")
        damage = event.get("damage")
        if stage is None or not damage:
            continue
        ticks.setdefault(int(stage), Counter())[round(float(damage), 2)] += 1
    return {phase: c.most_common(1)[0][0] for phase, c in ticks.items()}


def _fit_shrink(
    shrinking: List[_Sample], from_r: float, to_r: float
) -> Optional[Tuple[float, float]]:
    """Least-squares line through radius(t); return the times it hits from_r and to_r."""
    if len(shrinking) < 2:
        return None
    n = len(shrinking)
    mean_t = sum(s.t for s in shrinking) / n
    mean_r = sum(s.blue.r for s in shrinking) / n
    var_t = sum((s.t - mean_t) ** 2 for s in shrinking)
    if var_t == 0:
        return None
    slope = sum((s.t - mean_t) * (s.blue.r - mean_r) for s in shrinking) / var_t
    if slope >= 0:
        return None
    return mean_t + (from_r - mean_r) / slope, mean_t + (to_r - mean_r) / slope


def build_zone_timeline(telemetry_data: List[dict]) -> Optional[ZoneTimeline]:
    samples = _samples(telemetry_data)
    if not samples or not any(s.white for s in samples):
        return None

    stage_starts = _stage_starts(telemetry_data)
    dps = _zone_dps_by_phase(telemetry_data)
    timeline = ZoneTimeline(initial=samples[0].blue)

    # Group samples by the white circle they show: one group per phase.
    groups: List[List[_Sample]] = []
    for s in samples:
        if s.white is None:
            continue
        if not groups or not s.white.same_as(groups[-1][-1].white):
            groups.append([])
        groups[-1].append(s)

    prev_blue = timeline.initial
    for i, group in enumerate(groups):
        number = i + 1
        white = group[0].white
        assert white is not None
        phase = ZonePhase(phase=number, white=white, appear_t=group[0].t, dps=dps.get(number))

        # Appearance: exactly when the previous shrink ended; else first observed stage start.
        prev = timeline.phases[-1] if timeline.phases else None
        if prev and prev.shrink_end_t is not None:
            phase.appear_t = prev.shrink_end_t
        elif float(number) in stage_starts:
            phase.appear_t = min(phase.appear_t, stage_starts[float(number)])

        shrinking = [
            s for s in group if not s.blue.same_as(prev_blue) and not s.blue.same_as(white)
        ]
        waiting = [s for s in group if s.blue.same_as(prev_blue)]
        next_group = groups[i + 1] if i + 1 < len(groups) else []

        fit = _fit_shrink(shrinking, prev_blue.r, white.r)
        if fit:
            start, end = fit
            # Keep fitted times inside the sample interval they must fall in.
            lo = max([s.t for s in waiting] + [phase.appear_t])
            phase.shrink_start_t = min(max(start, lo), shrinking[0].t)
            hi = next_group[0].t if next_group else None
            end = max(end, shrinking[-1].t)
            phase.shrink_end_t = min(end, hi) if hi is not None else end
        else:
            phase.shrink_start_t = stage_starts.get(number + 0.5)
            phase.shrink_end_t = stage_starts.get(float(number + 1))
            if phase.shrink_end_t is None and next_group:
                phase.shrink_end_t = next_group[0].t

        if phase.shrink_start_t is not None and phase.shrink_start_t < phase.appear_t:
            phase.shrink_start_t = phase.appear_t
        timeline.phases.append(phase)
        prev_blue = white

    # Red zones: consecutive samples showing the same red circle.
    for i, s in enumerate(samples):
        if s.red is None:
            continue
        last = timeline.red_zones[-1] if timeline.red_zones else None
        if last and s.red.same_as(last.circle) and samples[i - 1].red is not None:
            last.end_t = s.t
        else:
            timeline.red_zones.append(RedZone(circle=s.red, start_t=s.t, end_t=s.t))
    for z in timeline.red_zones:
        # Visible until the next sample that no longer reports it.
        z.end_t = next((s.t for s in samples if s.t > z.end_t), z.end_t)

    return timeline
