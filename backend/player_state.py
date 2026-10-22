"""Per-player life state, alive count and loadout over time, from telemetry events.

Life cycle in telemetry:
- ``LogPlayerMakeGroggy`` (victim) → knocked; ``LogPlayerRevive`` (victim) → alive again.
- ``LogPlayerKillV2`` (victim) → dead. Dead players can be recalled by teammates (blue
  chip), which shows up as an in-game ``LogPlayerCreate`` → alive again, and they can die
  again later.
- Alive count = ``numStartPlayers`` − deaths + respawns (matches ``numAlivePlayers``).

Loadout:
- Guns / helmet / vest / backpack: ``LogItemEquip`` / ``LogItemUnequip``; broken armor
  only emits ``LogArmorDestroy``. The parachute pack equipped while (re)deploying is
  temporary and doesn't replace the backpack.
- Throwables ("utils"): ``LogItemPickup`` − ``LogItemDrop`` − ``LogPlayerUseThrowable``
  (loot box / care package pickups also emit a plain ``LogItemPickup``).
- Health: ``character.health`` on any event involving the player.

Combat (cumulative; matches the match-stats API numbers):
- Damage: ``LogPlayerTakeDamage`` dealt to players on other teams.
- Kills: ``LogPlayerKillV2`` where the player is ``killer`` (the credited killer, not the
  finisher). Knocks: ``LogPlayerMakeGroggy`` where the player is ``attacker``.

All series are change lists ``[(t, value), …]`` on the replay's elapsedTime clock.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

from telemetry_clock import TelemetryClock

ALIVE, KNOCKED, DEAD = "alive", "knocked", "dead"

# Event keys that may hold a character snapshot (name, health, location, …).
_CHARACTER_KEYS = ("character", "victim", "attacker", "reviver", "killer", "finisher")
_GUN_SLOTS = ("Main", "Handgun", "Melee")  # display order
_ARMOR_SLOTS = {"Headgear": "helmet", "Vest": "vest", "Backpack": "backpack"}
_TEMP_BACKPACKS = ("StartParachutePack",)
_PARACHUTE_VEHICLES = {"TransportAircraft", "EmergencyPickup"}


def item_name(item_id: str) -> str:
    """Item_Weapon_BerylM762_C → BerylM762 (display names are mapped client-side)."""
    name = re.sub(r"^Item_(Weapon_|Armor_|Head_|Back_)?", "", item_id)
    return re.sub(r"_C$", "", name)


def item_level(item_id: str) -> int:
    m = re.search(r"Lv(\d)", item_id)
    return int(m.group(1)) if m else 1


def vehicle_name(vehicle_id: str) -> str:
    """Dacia_A_03_v2_Esports_C → Dacia, BP_Motorbike_04_C → Motorbike."""
    return re.sub(r"^BP_", "", vehicle_id or "").split("_")[0] or "Vehicle"


@dataclass
class _Gear:
    guns: List[Tuple[str, str]] = field(default_factory=list)  # (name, slot)
    helmet: Optional[int] = None
    vest: Optional[int] = None
    backpack: Optional[int] = None
    throwables: Dict[str, int] = field(default_factory=dict)

    def snapshot(self) -> Dict[str, Any]:
        return {
            "guns": [
                {"name": name, "slot": slot}
                for name, slot in sorted(self.guns, key=lambda g: _GUN_SLOTS.index(g[1]))
            ],
            "helmet": self.helmet,
            "vest": self.vest,
            "backpack": self.backpack,
            "throwables": {k: v for k, v in sorted(self.throwables.items()) if v > 0},
        }


@dataclass
class PlayerTimeline:
    life: List[Tuple[float, str]] = field(default_factory=list)
    health: List[Tuple[float, float]] = field(default_factory=list)
    activity: List[Tuple[float, str]] = field(default_factory=list)
    gear: List[Tuple[float, Dict[str, Any]]] = field(default_factory=list)
    combat: List[Tuple[float, Dict[str, float]]] = field(default_factory=list)
    team_id: Optional[int] = None
    _gear: _Gear = field(default_factory=_Gear)
    _combat: Dict[str, float] = field(
        default_factory=lambda: {"damage": 0.0, "kills": 0, "knocks": 0}
    )
    _armor_ids: Dict[str, str] = field(default_factory=dict)

    @property
    def life_state(self) -> str:
        return self.life[-1][1] if self.life else ALIVE

    def set(self, series: List[Tuple[float, Any]], t: float, value: Any) -> None:
        if series and series[-1][1] == value:
            return
        if series and series[-1][0] == t:
            series.pop()
        if not series or series[-1][1] != value:
            series.append((t, value))

    def commit_gear(self, t: float) -> None:
        self.set(self.gear, t, self._gear.snapshot())

    def add_combat(self, t: float, stat: str, amount: float) -> None:
        self._combat[stat] += amount
        self.set(self.combat, t, {**self._combat, "damage": round(self._combat["damage"], 1)})

    def to_dict(self) -> Dict[str, Any]:
        return {
            "life": [[round(t, 2), s] for t, s in self.life],
            "health": [[round(t, 2), round(h, 1)] for t, h in self.health],
            "activity": [[round(t, 2), a] for t, a in self.activity],
            "gear": [[round(t, 2), g] for t, g in self.gear],
            "combat": [[round(t, 2), c] for t, c in self.combat],
        }


@dataclass
class PlayerStates:
    players: Dict[str, PlayerTimeline] = field(default_factory=dict)
    alive_counts: List[Tuple[float, int]] = field(default_factory=list)
    # Where each death happened (map-space conversion is done by the caller).
    deaths: List[Tuple[str, float, Dict[str, float]]] = field(default_factory=list)

    def life_at(self, name: str, t: float) -> str:
        state = ALIVE
        for change_t, value in self.players.get(name, PlayerTimeline()).life:
            if change_t > t:
                break
            state = value
        return state

    def find(self, name: Optional[str]) -> Optional[str]:
        if not name:
            return None
        if name in self.players:
            return name
        lower = name.lower()
        return next((n for n in self.players if n.lower() == lower), None)

    def teammates(self, name: str) -> List[str]:
        team = self.players[name].team_id
        if team is None:
            return []
        return sorted(n for n, p in self.players.items() if p.team_id == team and n != name)


def _enemies(a: dict, b: dict) -> bool:
    """True unless both characters are known to be on the same team (or the same player)."""
    if a.get("name") == b.get("name"):
        return False
    return a.get("teamId") is None or a.get("teamId") != b.get("teamId")


def build_player_states(telemetry_data: List[dict], clock: TelemetryClock) -> PlayerStates:
    states = PlayerStates()
    alive: Optional[int] = None
    seen_kills = set()

    def player(name: str) -> PlayerTimeline:
        return states.players.setdefault(name, PlayerTimeline())

    def change_alive(t: float, delta: int) -> None:
        nonlocal alive
        if alive is None:
            return
        alive += delta
        states.alive_counts.append((t, alive))

    for event in telemetry_data:
        kind = event.get("_T")
        common = event.get("common") or {}
        in_game = float(common.get("isGame") or 0) >= 0.1
        t = clock.of(event)

        if alive is None and kind == "LogGameStatePeriodic":
            start = (event.get("gameState") or {}).get("numStartPlayers")
            if start:
                alive = int(start)
                states.alive_counts.append((0.0, alive))

        # Health from any character snapshot in the event.
        for key in _CHARACTER_KEYS:
            ch = event.get(key)
            if isinstance(ch, dict) and ch.get("name") and "health" in ch:
                p = player(ch["name"])
                if ch.get("teamId") is not None:
                    p.team_id = ch["teamId"]
                if p.life_state != DEAD:
                    p.set(p.health, t, float(ch["health"]))

        if kind == "LogPlayerKillV2":
            victim = event.get("victim") or {}
            name = victim.get("name")
            if not name or (name, event.get("_D")) in seen_kills:
                continue
            seen_kills.add((name, event.get("_D")))
            p = player(name)
            p.set(p.life, t, DEAD)
            p.set(p.health, t, 0.0)
            if victim.get("location"):
                states.deaths.append((name, t, victim["location"]))
            change_alive(t, -1)
            killer = event.get("killer") or {}
            if killer.get("name") and _enemies(killer, victim):
                player(killer["name"]).add_combat(t, "kills", 1)
        elif kind == "LogPlayerMakeGroggy":
            victim = event.get("victim") or {}
            name = victim.get("name")
            if name:
                player(name).set(player(name).life, t, KNOCKED)
            attacker = event.get("attacker") or {}
            if attacker.get("name") and _enemies(attacker, victim):
                player(attacker["name"]).add_combat(t, "knocks", 1)
        elif kind == "LogPlayerTakeDamage":
            attacker = event.get("attacker") or {}
            victim = event.get("victim") or {}
            damage = float(event.get("damage") or 0)
            if attacker.get("name") and damage > 0 and _enemies(attacker, victim):
                player(attacker["name"]).add_combat(t, "damage", damage)
        elif kind == "LogPlayerRevive":
            name = (event.get("victim") or {}).get("name")
            if name and player(name).life_state == KNOCKED:
                player(name).set(player(name).life, t, ALIVE)
        elif kind == "LogPlayerCreate" and in_game:
            name = (event.get("character") or {}).get("name")
            if name:
                p = player(name)
                was_dead = p.life_state == DEAD
                p.set(p.life, t, ALIVE)
                if "health" in event["character"]:
                    p.set(p.health, t, float(event["character"]["health"]))
                if was_dead:  # respawned players start over; a rejoin keeps its gear
                    p._gear = _Gear()
                    p._armor_ids = {}
                    p.commit_gear(t)
                    change_alive(t, +1)
        elif kind in ("LogVehicleRide", "LogVehicleLeave"):
            name = (event.get("character") or {}).get("name")
            vehicle = event.get("vehicle") or {}
            if not name:
                continue
            p = player(name)
            vtype = vehicle.get("vehicleType")
            if kind == "LogVehicleRide":
                label = (
                    "In plane"
                    if vtype in _PARACHUTE_VEHICLES
                    else f"In {vehicle_name(vehicle.get('vehicleId', ''))}"
                )
            else:
                label = "Parachuting" if vtype in _PARACHUTE_VEHICLES else "On foot"
            p.set(p.activity, t, label)
        elif kind == "LogParachuteLanding":
            name = (event.get("character") or {}).get("name")
            if name:
                player(name).set(player(name).activity, t, "On foot")
        elif kind in ("LogSwimStart", "LogSwimEnd"):
            name = (event.get("character") or {}).get("name")
            if name:
                label = "Swimming" if kind == "LogSwimStart" else "On foot"
                player(name).set(player(name).activity, t, label)
        elif kind in ("LogItemEquip", "LogItemUnequip", "LogItemPickup", "LogItemDrop"):
            name = (event.get("character") or {}).get("name")
            item = event.get("item") or {}
            if name and in_game and _apply_item(player(name), kind, item):
                player(name).commit_gear(t)
        elif kind == "LogArmorDestroy":
            name = (event.get("victim") or {}).get("name")
            item = event.get("item") or {}
            p = player(name) if name else None
            slot = _ARMOR_SLOTS.get(item.get("subCategory", ""))
            if p and slot and p._armor_ids.get(slot) == item.get("itemId"):
                setattr(p._gear, slot, None)
                p._armor_ids.pop(slot, None)
                p.commit_gear(t)
        elif kind == "LogPlayerUseThrowable":
            name = (event.get("attacker") or {}).get("name")
            weapon = (event.get("weapon") or {}).get("itemId")
            if name and weapon and in_game:
                p = player(name)
                key = item_name(weapon)
                if p._gear.throwables.get(key, 0) > 0:
                    p._gear.throwables[key] -= 1
                    p.commit_gear(t)

    return states


def _apply_item(p: PlayerTimeline, kind: str, item: dict) -> bool:
    """Update gear for an item event; return True if it may have changed."""
    item_id = item.get("itemId", "")
    sub = item.get("subCategory", "")
    gear = p._gear
    if item.get("category") == "Weapon" and sub in _GUN_SLOTS:
        gun = (item_name(item_id), sub)
        if kind == "LogItemEquip" and gun not in gear.guns:
            gear.guns.append(gun)
        elif kind == "LogItemUnequip" and gun in gear.guns:
            gear.guns.remove(gun)
        else:
            return False
        return True
    if sub == "Throwable":
        key = item_name(item_id)
        count = int(item.get("stackCount") or 1)
        if kind == "LogItemPickup":
            gear.throwables[key] = gear.throwables.get(key, 0) + count
        elif kind == "LogItemDrop":
            gear.throwables[key] = max(0, gear.throwables.get(key, 0) - count)
        else:
            return False
        return True
    slot = _ARMOR_SLOTS.get(sub)
    if slot and kind in ("LogItemEquip", "LogItemUnequip"):
        if any(tag in item_id for tag in _TEMP_BACKPACKS):
            return False
        if kind == "LogItemEquip":
            setattr(gear, slot, item_level(item_id))
            p._armor_ids[slot] = item_id
        elif p._armor_ids.get(slot) == item_id:
            setattr(gear, slot, None)
            p._armor_ids.pop(slot, None)
        return True
    return False
