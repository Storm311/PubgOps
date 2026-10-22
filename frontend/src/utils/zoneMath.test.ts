import { ZoneTimeline, zoneAt } from "./zoneMath";

const timeline: ZoneTimeline = {
  initial: { x: 500, y: 500, r: 700 },
  phases: [
    {
      phase: 1,
      white: { x: 400, y: 500, r: 300 },
      appear_t: 90,
      shrink_start_t: 200,
      shrink_end_t: 400,
      dps: 0.4,
    },
    {
      phase: 2,
      white: { x: 400, y: 450, r: 150 },
      appear_t: 400,
      shrink_start_t: 500,
      shrink_end_t: null,
      dps: 0.66,
    },
  ],
  red_zones: [{ x: 100, y: 100, r: 40, start_t: 300, end_t: 360 }],
};

describe("zoneAt", () => {
  test("before the first circle only the initial blue zone exists", () => {
    const s = zoneAt(timeline, 30);
    expect(s.status).toBe("pre");
    expect(s.phase).toBe(0);
    expect(s.blue).toEqual(timeline.initial);
    expect(s.white).toBeNull();
  });

  test("waiting: blue stays put, countdown to shrink start", () => {
    const s = zoneAt(timeline, 150);
    expect(s.status).toBe("waiting");
    expect(s.phase).toBe(1);
    expect(s.blue).toEqual(timeline.initial);
    expect(s.white).toEqual(timeline.phases[0].white);
    expect(s.countdown).toBe(50);
    expect(s.dps).toBe(0.4);
  });

  test("shrinking: center and radius move linearly onto the white circle", () => {
    const s = zoneAt(timeline, 300);
    expect(s.status).toBe("shrinking");
    expect(s.blue).toEqual({ x: 450, y: 500, r: 500 });
    expect(s.countdown).toBe(100);
  });

  test("next phase starts from the previous white circle", () => {
    const s = zoneAt(timeline, 450);
    expect(s.phase).toBe(2);
    expect(s.status).toBe("waiting");
    expect(s.blue).toEqual(timeline.phases[0].white);
    expect(s.white).toEqual(timeline.phases[1].white);
  });

  test("unknown shrink end holds the blue zone in place", () => {
    const s = zoneAt(timeline, 600);
    expect(s.status).toBe("shrinking");
    expect(s.blue).toEqual(timeline.phases[0].white);
    expect(s.countdown).toBeNull();
  });

  test("red zones are only active inside their window", () => {
    expect(zoneAt(timeline, 299).redZones).toHaveLength(0);
    expect(zoneAt(timeline, 320).redZones).toHaveLength(1);
    expect(zoneAt(timeline, 360).redZones).toHaveLength(0);
  });
});
