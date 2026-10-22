/** Step-series lookups for per-player state over replay time (pure, unit-tested). */

/** Change list sorted by time: [t, value] — value holds until the next entry. */
export type Series<T> = [number, T][];

export type LifeState = "alive" | "knocked" | "dead";

export interface GearGun {
  name: string;
  slot: "Main" | "Handgun" | "Melee";
}

export interface Gear {
  guns: GearGun[];
  helmet: number | null;
  vest: number | null;
  backpack: number | null;
  throwables: Record<string, number>;
}

/** Cumulative: damage to other teams, credited kills, knocks. */
export interface Combat {
  damage: number;
  kills: number;
  knocks: number;
}

export interface PlayerState {
  life: Series<LifeState>;
  health: Series<number>;
  activity: Series<string>;
  gear: Series<Gear>;
  combat: Series<Combat>;
}

export interface Teammate extends PlayerState {
  name: string;
}

/** Everything about one player at a single replay time. */
export interface PlayerSnapshot {
  life: LifeState;
  activity: string | null;
  health: number;
  gear: Gear;
  combat: Combat;
}

export function valueAt<T>(series: Series<T> | undefined, t: number, fallback: T): T {
  if (!series || series.length === 0 || t < series[0][0]) return fallback;
  let lo = 0;
  let hi = series.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= t) lo = mid + 1;
    else hi = mid;
  }
  return series[lo - 1][1];
}

export const EMPTY_GEAR: Gear = {
  guns: [],
  helmet: null,
  vest: null,
  backpack: null,
  throwables: {},
};

export const NO_COMBAT: Combat = { damage: 0, kills: 0, knocks: 0 };

export function snapshotAt(state: PlayerState, t: number): PlayerSnapshot {
  return {
    life: valueAt(state.life, t, "alive" as LifeState),
    activity: valueAt<string | null>(state.activity, t, null),
    health: valueAt(state.health, t, 100),
    gear: valueAt(state.gear, t, EMPTY_GEAR),
    combat: valueAt(state.combat, t, NO_COMBAT),
  };
}

/** Telemetry item ids whose in-game name differs. */
const ITEM_LABELS: Record<string, string> = {
  HK416: "M416",
  FNFal: "SLR",
  Berreta686: "S686",
  BerylM762: "Beryl M762",
  Mk47Mutant: "Mk47 Mutant",
  DesertEagle: "Deagle",
  NagantM1895: "R1895",
  G18: "P18C",
  M1911: "P1911",
  M9: "P92",
  Rhino: "R45",
  Cowbar: "Crowbar",
  Saiga12: "S12K",
  Winchester: "S1897",
  DP12: "DBS",
  Sawnoff: "Sawed-off",
  L6: "Lynx AMR",
  BizonPP19: "PP-19 Bizon",
  UZI: "Micro UZI",
  UMP: "UMP45",
  Thompson: "Tommy Gun",
  Mini14: "Mini 14",
  QBZ95: "QBZ",
  QBU88: "QBU",
  Mosin: "Mosin-Nagant",
  Win1894: "Win94",
  FAMASG2: "FAMAS",
  PanzerFaust100M: "Panzerfaust",
  FlareGun: "Flare Gun",
  StunGun: "Stun Gun",
  Grenade: "Frag",
  SmokeBomb: "Smoke",
  FlashBang: "Stun",
  BluezoneGrenade: "Blue Zone Grenade",
  StickyGrenade: "Sticky Bomb",
  DecoyGrenade: "Decoy",
  C4: "C4",
};

export function itemLabel(name: string): string {
  return ITEM_LABELS[name] ?? name.replace(/_/g, " ");
}
