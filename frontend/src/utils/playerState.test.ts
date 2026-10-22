import {
  itemLabel,
  LifeState,
  PlayerState,
  Series,
  snapshotAt,
  valueAt,
} from "./playerState";

describe("valueAt", () => {
  const life: Series<LifeState> = [
    [10, "knocked"],
    [20, "dead"],
    [40, "alive"],
    [50, "dead"],
  ];

  test("falls back before the first change", () => {
    expect(valueAt(life, 5, "alive")).toBe("alive");
    expect(valueAt(undefined, 5, "alive")).toBe("alive");
    expect(valueAt([], 5, "alive")).toBe("alive");
  });

  test("holds each value until the next change (dead → respawned → dead)", () => {
    expect(valueAt(life, 10, "alive")).toBe("knocked");
    expect(valueAt(life, 25, "alive")).toBe("dead");
    expect(valueAt(life, 45, "alive")).toBe("alive");
    expect(valueAt(life, 99, "alive")).toBe("dead");
  });
});

describe("itemLabel", () => {
  test("maps telemetry ids to in-game names", () => {
    expect(itemLabel("HK416")).toBe("M416");
    expect(itemLabel("SmokeBomb")).toBe("Smoke");
    expect(itemLabel("Kar98k")).toBe("Kar98k");
    expect(itemLabel("Some_New_Gun")).toBe("Some New Gun");
  });
});

describe("snapshotAt", () => {
  const state: PlayerState = {
    life: [[30, "dead"]],
    health: [[10, 60]],
    activity: [[0, "On foot"]],
    gear: [],
    combat: [[20, { damage: 120.5, kills: 1, knocks: 2 }]],
  };

  test("defaults before any change, then latest values", () => {
    const early = snapshotAt(state, 5);
    expect(early.life).toBe("alive");
    expect(early.health).toBe(100);
    expect(early.combat).toEqual({ damage: 0, kills: 0, knocks: 0 });
    expect(early.gear.guns).toEqual([]);

    const late = snapshotAt(state, 35);
    expect(late.life).toBe("dead");
    expect(late.health).toBe(60);
    expect(late.combat.kills).toBe(1);
  });
});
