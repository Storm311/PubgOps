"""Map telemetry wall-clock timestamps (``_D``) onto the replay's ``elapsedTime`` clock.

Only some events (e.g. ``LogPlayerPosition``) carry ``elapsedTime``; most (kills, items,
revives, …) only have ``_D``. The two clocks drift apart by several seconds over a match,
so wall-clock offsets from match start can't be used directly.
"""

from __future__ import annotations

from bisect import bisect_right
from datetime import datetime
from typing import List, Tuple


def parse_ts(ts: str) -> float:
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()


class TelemetryClock:
    def __init__(self, telemetry_data: List[dict]):
        first_seen: dict = {}
        for event in telemetry_data:
            elapsed = event.get("elapsedTime")
            if not elapsed or elapsed <= 0 or "_D" not in event:
                continue
            wall = parse_ts(event["_D"])
            if elapsed not in first_seen or wall < first_seen[elapsed]:
                first_seen[elapsed] = wall
        # (wall, elapsed) pairs, monotonic in both
        pairs: List[Tuple[float, float]] = []
        for elapsed in sorted(first_seen):
            wall = first_seen[elapsed]
            if not pairs or wall > pairs[-1][0]:
                pairs.append((wall, float(elapsed)))
        self._walls = [p[0] for p in pairs]
        self._elapsed = [p[1] for p in pairs]

    def at_wall(self, wall: float) -> float:
        walls, elapsed = self._walls, self._elapsed
        if not walls:
            return 0.0
        if wall <= walls[0]:
            return max(0.0, elapsed[0] - (walls[0] - wall))
        if wall >= walls[-1]:
            return elapsed[-1] + (wall - walls[-1])
        i = bisect_right(walls, wall)
        w0, w1 = walls[i - 1], walls[i]
        e0, e1 = elapsed[i - 1], elapsed[i]
        return e0 + (e1 - e0) * (wall - w0) / (w1 - w0)

    def of(self, event: dict) -> float:
        """Elapsed seconds for an event, preferring its own ``elapsedTime``."""
        elapsed = event.get("elapsedTime")
        if elapsed and elapsed > 0:
            return float(elapsed)
        if "_D" in event:
            return self.at_wall(parse_ts(event["_D"]))
        return 0.0
