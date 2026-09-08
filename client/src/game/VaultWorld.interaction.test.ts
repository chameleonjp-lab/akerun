import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOfficialPuzzle,
  createPuzzleFromSeed,
  createTrainingPuzzle,
  type PuzzleDefinition,
} from "./GameDefinitions";
import { VaultWorld, calculateScreenLayout, type Rect } from "./VaultWorld";
import { DIAL_STOP_CONFIRM_SECONDS } from "./LockMechanism";

// Only browser facilities are substituted. InputController, drawing/hitboxes,
// VaultWorld, the mechanism and result creation all execute normally.
class TestCanvas extends EventTarget {
  width = 0;
  height = 0;
  captured = new Set<number>();
  constructor(
    public clientWidth: number,
    public clientHeight: number
  ) {
    super();
  }
  getBoundingClientRect() {
    return {
      left: 0,
      top: 0,
      width: this.clientWidth,
      height: this.clientHeight,
    };
  }
  setPointerCapture(id: number) {
    this.captured.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captured.has(id);
  }
  releasePointerCapture(id: number) {
    this.captured.delete(id);
  }
}

const noop = () => {};
const createContext = () =>
  new Proxy(
    {
      measureText: (text: string) => ({ width: text.length * 7 }),
      createLinearGradient: () => ({ addColorStop: noop }),
      createRadialGradient: () => ({ addColorStop: noop }),
    },
    { get: (target, key) => Reflect.get(target, key) ?? noop }
  ) as unknown as CanvasRenderingContext2D;

type Renderer = {
  drawTensionHandle: (rect: Rect, unit: number) => void;
  drawFenceLever: (rect: Rect, unit: number) => void;
  drawBoltTab: (rect: Rect, unit: number) => void;
  drawDoorHandle: (rect: Rect, unit: number) => void;
};
type Point = { x: number; y: number };
const worlds: VaultWorld[] = [];

beforeEach(() => {
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { search: "" },
      devicePixelRatio: 2,
      matchMedia: (query: string) => ({
        matches: query === "(pointer: coarse)",
      }),
      localStorage: { getItem: () => null, setItem: noop },
    })
  );
  vi.stubGlobal("Image", class {});
});
afterEach(() => {
  worlds.splice(0).forEach(world => world.dispose());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(
  puzzle: PuzzleDefinition,
  training: boolean,
  postDial = false,
  width = 402,
  height = 874,
  gripFraction = 1
) {
  const canvas = new TestCanvas(width, height);
  const onSnapshot = vi.fn();
  const world = new VaultWorld(
    createContext(),
    canvas as unknown as HTMLCanvasElement,
    undefined,
    onSnapshot
  );
  worlds.push(world);
  const renderer = world as unknown as Renderer;
  const drawings = {
    tension: vi.spyOn(renderer, "drawTensionHandle"),
    fence: vi.spyOn(renderer, "drawFenceLever"),
    bolt: vi.spyOn(renderer, "drawBoltTab"),
    handle: vi.spyOn(renderer, "drawDoorHandle"),
  };
  world.startPuzzle(puzzle, { training, postDial, persistProgress: false });
  world.update(0);
  const pointer = (type: string, point: Point, id = 1) => {
    const event = new Event(type, { cancelable: true });
    if (type === "lostpointercapture") canvas.captured.delete(id);
    Object.assign(event, {
      pointerId: id,
      pointerType: "touch",
      clientX: (point.x * width) / Math.max(1, width),
      clientY: (point.y * height) / Math.max(1, height),
    });
    canvas.dispatchEvent(event);
  };
  const advanceUntil = (phase: string, limit = 180) => {
    for (
      let frame = 0;
      frame < limit && world.getSnapshot().phase !== phase;
      frame++
    )
      world.update(1 / 60);
    expect(world.getSnapshot().phase).toBe(phase);
  };
  const grip = (part: keyof typeof drawings): Point => {
    const call = drawings[part].mock.calls.at(-1);
    expect(call, `${part} must actually be drawn`).toBeDefined();
    const [rect, unit] = call!;
    // Select the visible metal, not the center of the hitbox under test.
    if (part === "tension") {
      const arm = Math.min(rect.width * 0.26, unit * 8.2) * gripFraction;
      return {
        x: rect.x + rect.width * 0.52 + Math.cos((-32 * Math.PI) / 180) * arm,
        y: rect.y + rect.height * 0.62 + Math.sin((-32 * Math.PI) / 180) * arm,
      };
    }
    if (part === "fence")
      return { x: rect.x + rect.width * 0.52, y: rect.y + rect.height * 0.78 };
    if (part === "bolt")
      return { x: rect.x + rect.width * 0.16, y: rect.y + rect.height * 0.54 };
    return { x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.54 };
  };
  const move = (start: Point, value: number, vertical = false) => {
    const distance = 18 + Math.max(72, width * 0.18) * value;
    pointer(
      "pointermove",
      vertical
        ? { x: start.x, y: start.y - distance }
        : { x: start.x + distance, y: start.y }
    );
  };
  const operate = (
    part: keyof typeof drawings,
    testingPhase: string,
    nextPhase: string,
    value: number
  ) => {
    const start = grip(part);
    pointer("pointerdown", start);
    expect(canvas.captured.has(1)).toBe(true);
    move(start, 0.04, part === "fence");
    world.update(1 / 60); // A real frame between starting and completing the drag.
    expect(world.getSnapshot().phase).toBe(testingPhase);
    expect(
      canvas.captured.has(1),
      "ready → test must retain the same finger"
    ).toBe(true);
    for (let frame = 0; frame < 31; frame++) world.update(1 / 60);
    expect(world.getSnapshot().phase).toBe(testingPhase);
    expect(
      canvas.captured.has(1),
      "a low drag remains active for more than 0.5 seconds"
    ).toBe(true);
    move(start, value, part === "fence");
    advanceUntil(nextPhase);
    expect(
      canvas.captured.size,
      "changing parts or opening releases the finger"
    ).toBe(0);
    move(start, 1, part === "fence");
    world.update(1 / 60);
    expect(world.getSnapshot().phase).toBe(nextPhase);
    pointer("pointerup", start);
  };
  const solveDial = () => {
    const dial = calculateScreenLayout(
      Math.max(320, width),
      Math.max(1, height),
      training
    ).dial;
    let angle = 0;
    const point = () => ({
      x: dial.x + Math.cos(angle) * dial.radius * 0.8,
      y: dial.y + Math.sin(angle) * dial.radius * 0.8,
    });
    const mechanism = (
      world as unknown as {
        mechanism: {
          activeStage: { target: number; direction: "cw" | "ccw" } | null;
          dial: number;
          lastDirection: "cw" | "ccw";
        };
      }
    ).mechanism;
    pointer("pointerdown", point());
    for (
      let turns = 0;
      world.getSnapshot().stage < puzzle.stages.length && turns < 4000;
      turns++
    ) {
      const direction =
        puzzle.stages[world.getSnapshot().stage].direction === "cw" ? 1 : -1;
      angle += ((direction * Math.PI * 2) / 100) * 1.00000001;
      pointer("pointermove", point());
      world.update(1 / 60);
      const activeStage = mechanism.activeStage;
      if (
        activeStage &&
        mechanism.dial === activeStage.target &&
        mechanism.lastDirection === activeStage.direction
      ) {
        const stopFrames = Math.ceil(DIAL_STOP_CONFIRM_SECONDS * 60) + 2;
        for (let frame = 0; frame < stopFrames; frame += 1) {
          pointer("pointermove", point());
          world.update(1 / 60);
        }
      }
    }
    pointer("pointerup", point());
    expect(world.getSnapshot().stage).toBe(puzzle.stages.length);
    advanceUntil("tension-ready");
  };
  const open = () => {
    operate("tension", "tension-test", "fence-ready", 0.69);
    operate("fence", "fence-ready", "fence-seated", 0.68);
    operate("bolt", "bolt-test", "boltwork-ready", 0.9);
    operate("handle", "handle-test", "open", 0.96);
    expect(world.getSnapshot()).toMatchObject({
      opened: true,
      status: "opened",
      faultCount: 0,
    });
    expect(world.getSnapshot().runResult).not.toBeNull();
    expect(onSnapshot.mock.lastCall?.[0]).toMatchObject({
      opened: true,
      status: "opened",
    });
  };
  return { canvas, world, pointer, advanceUntil, grip, move, solveDial, open };
}

describe("rendered touch controls → mechanism → result", () => {
  it("publishes readable action metadata without leaking hidden targets", () => {
    const guided = setup(createOfficialPuzzle("AKERUN-01-V1"), false);
    expect(guided.world.getSnapshot()).toMatchObject({
      activeWheel: 3,
      activeDirection: "ccw",
      activeTarget: 18,
      currentPass: 1,
      requiredPasses: 5,
      targetStopPending: false,
    });

    const hidden = setup(createOfficialPuzzle("AKERUN-03-V1"), false);
    expect(hidden.world.getSnapshot()).toMatchObject({
      activeTarget: null,
      activeDirection: "ccw",
      currentPass: 1,
      requiredPasses: expect.any(Number),
    });
    expect(hidden.world.getSnapshot().protocolInstruction).not.toContain("目標");

    const blind = setup(createPuzzleFromSeed(20260908, "blind"), false);
    expect(blind.world.getSnapshot()).toMatchObject({
      activeWheel: null,
      activeDirection: null,
      activeTarget: null,
      currentPass: null,
      requiredPasses: null,
      targetStopPending: false,
      protocolInstruction: "ブラインドモード：音と振動の合図を聞いて操作します。",
    });
  });

  it.each([
    [402, 874, 0.81],
    [402, 874, 1],
    [874, 402, 1],
  ])(
    "completes training 3 at %i × %i from the visible grip at arm fraction %f",
    (width, height, gripFraction) => {
      const game = setup(
        createTrainingPuzzle(3),
        true,
        true,
        width,
        height,
        gripFraction
      );
      game.open();
      expect(game.world.getSnapshot().recordable).toBe(false);
    }
  );
  it.each(["training-4", "official-01"])(
    "completes %s using only pointer events and frames",
    name => {
      const training = name === "training-4";
      const puzzle = training
        ? createTrainingPuzzle(4)
        : createOfficialPuzzle("AKERUN-01-V1");
      const game = setup(puzzle, training);
      game.solveDial();
      game.open();
      expect(game.world.getSnapshot().recordable).toBe(!training);
    }
  );
  it("does not write hidden gate truth into an observation note", () => {
    const puzzle = createOfficialPuzzle("AKERUN-03-V1");
    const game = setup(puzzle, false);
    const internals = game.world as unknown as {
      mechanism: {
        dial: number;
        activeStage: { wheel: number } | null;
        lastDirection: "cw" | "ccw";
        puzzle: typeof puzzle;
      };
      captureObservation: () => void;
      observations: { recent: ReadonlyArray<Record<string, unknown>> };
    };
    const stage = internals.mechanism.activeStage;
    const falseGate = puzzle.falseGates.find(
      gate => gate.wheel === stage?.wheel
    );
    expect(falseGate).toBeDefined();
    internals.mechanism.dial = falseGate!.position;
    internals.captureObservation();
    const note = internals.observations.recent[0];
    expect(note).toMatchObject({
      category: "contact",
      problemId: "AKERUN-03-V1",
      problemVersion: "V1",
      wheel: (stage?.wheel ?? 0) + 1,
      dial: falseGate!.position,
      direction: puzzle.stages[0]?.direction,
      pass: 1,
      signal: "rebound",
    });
    expect(String(note?.text)).not.toMatch(/正規|偽ゲート/);
  });
  it("recovers from a tension jam on release and stops at the fault limit", () => {
    const puzzle = createOfficialPuzzle("AKERUN-01-V1");
    const game = setup(puzzle, false, true);
    for (let fault = 1; fault <= puzzle.difficulty.maxFaults; fault++) {
      const start = game.grip("tension");
      game.pointer("pointerdown", start);
      game.move(start, 1);
      const phase =
        fault === puzzle.difficulty.maxFaults ? "lockout" : "jammed";
      game.advanceUntil(phase);
      expect(game.world.getSnapshot().faultCount).toBe(fault);
      expect(game.canvas.captured.has(1)).toBe(phase === "jammed");
      game.pointer("pointerup", start);
      game.world.update(1 / 60);
      if (phase === "jammed")
        expect(game.world.getSnapshot().phase).toBe("tension-ready");
    }
    const elapsed = game.world.getSnapshot().elapsedTime;
    game.world.update(1);
    expect(game.world.getSnapshot()).toMatchObject({
      phase: "lockout",
      elapsedTime: elapsed,
      opened: false,
      runResult: null,
    });
  });
  it.each(["pointercancel", "pointerup", "pause"])(
    "releases pressure on %s and requires a new drag",
    event => {
      const game = setup(createTrainingPuzzle(3), true, true);
      const start = game.grip("tension");
      game.pointer("pointerdown", start);
      game.move(start, 0.69);
      game.world.update(1 / 60);
      if (event === "pause") game.world.setPaused(true);
      else game.pointer(event, start);
      expect(game.canvas.captured.size).toBe(0);
      const elapsed = game.world.getSnapshot().elapsedTime;
      game.move(start, 0.69);
      game.world.update(0.5);
      if (event === "pause") {
        expect(game.world.getSnapshot().elapsedTime).toBe(elapsed);
        game.world.setPaused(false);
      }
      game.world.update(0.5);
      expect(game.world.getSnapshot().phase).toBe("tension-ready");
      game.open();
    }
  );
  it("removes input listeners when the constructor's first draw fails", () => {
    const canvas = new TestCanvas(402, 874);
    const add = vi.spyOn(canvas, "addEventListener");
    const remove = vi.spyOn(canvas, "removeEventListener");
    const addWindow = vi.spyOn(window, "addEventListener");
    const removeWindow = vi.spyOn(window, "removeEventListener");
    const context = createContext();
    context.setTransform = () => {
      throw new Error("drawing unavailable");
    };
    expect(
      () => new VaultWorld(context, canvas as unknown as HTMLCanvasElement)
    ).toThrow("drawing unavailable");
    for (const [type, listener] of add.mock.calls)
      expect(
        remove.mock.calls.some(call => call[0] === type && call[1] === listener)
      ).toBe(true);
    for (const [type, listener] of addWindow.mock.calls)
      expect(
        removeWindow.mock.calls.some(
          call => call[0] === type && call[1] === listener
        )
      ).toBe(true);
  });
});
