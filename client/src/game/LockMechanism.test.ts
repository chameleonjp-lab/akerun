import { describe, expect, it } from "vitest";
import { createFalseGateTrainingPuzzle, createOfficialPuzzle, createPuzzleFromSeed, createReferencePuzzle, type PuzzleDefinition } from "./GameDefinitions";
import { LockMechanism } from "./LockMechanism";

const advance = (lock: LockMechanism, seconds: number) => {
  const frames = Math.ceil(seconds * 90);
  for (let frame = 0; frame < frames; frame += 1) lock.tick(1 / 90);
};

const alignGates = (lock: LockMechanism, puzzle: PuzzleDefinition) => {
  for (let index = 0; index < puzzle.stages.length; index += 1) {
    const stage = puzzle.stages[index];
    let guard = 0;
    while (lock.stage === index && guard < 900) {
      lock.rotate(stage.direction === "cw" ? 1 : -1);
      guard += 1;
    }
    expect(lock.stage).toBe(index + 1);
    expect(lock.locked[stage.wheel]).toBe(true);
  }
  if (lock.phase === "settling") {
    advance(lock, puzzle.vault.personality.settlingDelaySeconds + 0.04);
  }
  expect(lock.phase).toBe("tension-ready");
};

const solve = (puzzle: PuzzleDefinition) => {
  const lock = new LockMechanism(puzzle);
  alignGates(lock, puzzle);
  const [tensionMin, tensionMax] = puzzle.difficulty.tensionBand;
  lock.setTension((tensionMin + tensionMax) / 2);
  advance(lock, puzzle.difficulty.tensionHoldSeconds + 0.08);
  expect(lock.phase).toBe("fence-ready");

  const [fenceMin, fenceMax] = puzzle.difficulty.fenceBand;
  lock.setFenceTravel((fenceMin + fenceMax) / 2);
  advance(lock, puzzle.difficulty.fenceHoldSeconds + 0.08);
  expect(lock.phase).toBe("fence-seated");

  lock.setBoltTravel(0.84);
  advance(lock, 0.28);
  expect(lock.phase).toBe("boltwork-ready");
  expect(lock.boltworkReleased).toBe(true);
  expect(lock.opened).toBe(false);
  lock.setHandleTurn(0.92);
  advance(lock, 0.28);
  expect(lock.opened).toBe(true);
  expect(lock.phase).toBe("open");
};

describe("LockMechanism", () => {
  it("同一seedから同一の可変パズルを生成する", () => {
    const first = createPuzzleFromSeed(90210);
    const second = createPuzzleFromSeed(90210);
    const third = createPuzzleFromSeed(90211);
    expect(first.stages).toEqual(second.stages);
    expect(first.stages).not.toEqual(third.stages);
    expect(new Set(first.stages.map((stage) => stage.target)).size).toBe(first.stages.length);
  });

  it("異なる契約seedが金庫型と報酬のバリエーションを選ぶ", () => {
    const puzzles = [90210, 90211, 90212].map((seed) => createPuzzleFromSeed(seed));
    expect(new Set(puzzles.map((puzzle) => puzzle.vault.id)).size).toBe(3);
    expect(new Set(puzzles.map((puzzle) => puzzle.reward.id)).size).toBe(3);
    expect(puzzles[0].stages.map((stage) => stage.direction)).toEqual(["ccw", "cw", "ccw", "cw", "ccw", "cw"]);
    expect(puzzles[1].stages.map((stage) => stage.direction)).toEqual(["cw", "ccw", "cw", "ccw", "cw", "ccw"]);
    expect(new Set(puzzles.map((puzzle) => puzzle.vault.preload.label)).size).toBe(3);
    expect(puzzles[1].vault.preload.baseResistance).toBeGreaterThan(puzzles[0].vault.preload.baseResistance);
  });

  it("基準金庫と可変金庫を抵抗、フェンス、ボルトの順に開錠できる", () => {
    solve(createReferencePuzzle("standard"));
    solve(createPuzzleFromSeed(90210, "observe"));
    solve(createPuzzleFromSeed(140250, "expert"));
  });

  it("方向反転と通過回数により、フライが外側から順にホイールを拾って切り離す", () => {
    const puzzle = createReferencePuzzle("observe");
    const lock = new LockMechanism(puzzle);
    expect(puzzle.stages.map((stage) => [stage.direction, stage.passes, stage.wheel])).toEqual([
      ["ccw", 7, 5],
      ["cw", 6, 4],
      ["ccw", 5, 3],
      ["cw", 4, 2],
      ["ccw", 3, 1],
      ["cw", 2, 0],
    ]);
    expect(lock.coupledWheels).toEqual([0]);

    const first = puzzle.stages[0];
    let guard = 0;
    while (lock.currentPass === 1 && guard < 140) {
      lock.rotate(first.direction === "cw" ? 1 : -1);
      guard += 1;
    }
    expect(lock.currentPass).toBe(2);
    expect(lock.coupledWheels).toEqual([0, 1]);

    const dialBeforeWrongDirection = lock.dial;
    lock.rotate(1);
    expect(lock.dial).toBe(dialBeforeWrongDirection);

    while (lock.stage === 0 && guard < 900) {
      lock.rotate(first.direction === "cw" ? 1 : -1);
      guard += 1;
    }
    expect(lock.locked[5]).toBe(true);
    expect(lock.stage).toBe(1);
    expect(lock.activeStage?.direction).toBe("cw");
  });

  it("浅い偽ゲートは接触の手掛かりを返すが、正規ゲートの整列や通過回数を進めない", () => {
    const puzzle = createReferencePuzzle("observe");
    const lock = new LockMechanism(puzzle);
    const stage = puzzle.stages[0];
    const falseGate = puzzle.falseGates.find((gate) => gate.wheel === stage.wheel);
    expect(falseGate).toBeDefined();
    expect(puzzle.falseGates).toHaveLength(puzzle.vault.wheelCount * 2);
    expect(puzzle.falseGates.some((gate) => gate.position === stage.target)).toBe(false);
    let guard = 0;
    while (lock.dial !== falseGate?.position && guard < 120) {
      lock.rotate(stage.direction === "cw" ? 1 : -1);
      guard += 1;
    }
    expect(lock.contactProfile).toBe("false-gate");
    expect(lock.lastRotationFalseGateContacts).toBe(1);
    expect(lock.stage).toBe(0);
    expect(lock.currentPass).toBe(1);
    expect(lock.lastMessage).toContain("偽ゲート");
  });

  it("偽ゲート訓練契約は二輪の短い手順で、浅い接触を反証して開錠できる", () => {
    const puzzle = createFalseGateTrainingPuzzle();
    const lock = new LockMechanism(puzzle);
    expect(puzzle.vault.wheelCount).toBe(2);
    expect(puzzle.difficulty.id).toBe("observe");
    expect(puzzle.falseGates).toHaveLength(4);
    const firstFalseGate = puzzle.falseGates.find((gate) => gate.wheel === puzzle.stages[0].wheel);
    expect(firstFalseGate).toBeDefined();
    let guard = 0;
    while (lock.dial !== firstFalseGate?.position && guard < 120) {
      lock.rotate(puzzle.stages[0].direction === "cw" ? 1 : -1);
      guard += 1;
    }
    expect(lock.contactProfile).toBe("false-gate");
    expect(lock.stage).toBe(0);
    solve(puzzle);
  });

  it("金庫ごとに扉側ボルト配置と必要なハンドル回転量が異なる", () => {
    const aurora = new LockMechanism(createPuzzleFromSeed(90210));
    const nocturne = new LockMechanism(createPuzzleFromSeed(90211));
    const pelagic = new LockMechanism(createPuzzleFromSeed(90212));
    expect(aurora.puzzle.vault.boltLayout.boltRatios).toHaveLength(3);
    expect(nocturne.puzzle.vault.boltLayout.boltRatios).toHaveLength(4);
    expect(nocturne.puzzle.vault.boltLayout.carrierSide).toBe("left");
    expect(pelagic.puzzle.vault.boltLayout.label).toBe("OFFSET MARINE");
    expect(nocturne.requiredHandleTurn).toBeGreaterThan(aurora.requiredHandleTurn);
    expect(pelagic.requiredHandleTurn).toBeLessThan(aurora.requiredHandleTurn);
  });

  it("金庫ごとに観察すべき接触反応が異なる", () => {
    const aurora = new LockMechanism(createPuzzleFromSeed(90210, "observe"));
    const nocturne = new LockMechanism(createPuzzleFromSeed(90211, "observe"));
    const pelagic = new LockMechanism(createPuzzleFromSeed(90212, "observe"));
    const edgeDepth = (lock: LockMechanism) => {
      const target = lock.puzzle.stages[0].target;
      lock.dial = (target + 99) % 100;
      return lock.contactDepth;
    };
    const falseDepth = (lock: LockMechanism) => {
      const falseGate = lock.puzzle.falseGates.find((gate) => gate.wheel === lock.puzzle.stages[0].wheel);
      if (!falseGate) throw new Error("false gate missing");
      lock.dial = falseGate.position;
      return lock.contactDepth;
    };

    expect(aurora.puzzle.vault.personality.id).toBe("clear-contact");
    expect(nocturne.puzzle.vault.personality.id).toBe("comparison");
    expect(pelagic.puzzle.vault.personality.id).toBe("timing");
    expect(edgeDepth(aurora)).toBeGreaterThan(edgeDepth(nocturne));
    expect(falseDepth(nocturne)).toBeGreaterThan(falseDepth(aurora));
    expect(pelagic.puzzle.vault.personality.settlingDelaySeconds).toBeGreaterThan(0);
  });

  it("公式問題へ金庫固有の候補密度と許容帯を反映する", () => {
    const aurora = createOfficialPuzzle("AKERUN-01-V1");
    const nocturne = createOfficialPuzzle("AKERUN-02-V1");
    const pelagic = createOfficialPuzzle("AKERUN-03-V1");
    const bandWidth = (band: readonly [number, number]) => band[1] - band[0];

    expect(aurora.vault.personality.falseGatesPerWheel).toBe(2);
    expect(nocturne.vault.personality.falseGatesPerWheel).toBe(3);
    expect(pelagic.vault.personality.falseGatesPerWheel).toBe(2);
    expect(bandWidth(aurora.difficulty.tensionBand)).toBeGreaterThan(
      bandWidth(nocturne.difficulty.tensionBand)
    );
    expect(bandWidth(aurora.difficulty.fenceBand)).toBeGreaterThan(
      bandWidth(nocturne.difficulty.fenceBand)
    );
  });

  it("Pelagicは停止後の反応が落ち着くまでテンションへ進めない", () => {
    const puzzle = createPuzzleFromSeed(90212, "observe");
    const lock = new LockMechanism(puzzle);
    for (let index = 0; index < puzzle.stages.length; index += 1) {
      const stage = puzzle.stages[index];
      let guard = 0;
      while (lock.stage === index && guard < 900) {
        lock.rotate(stage.direction === "cw" ? 1 : -1);
        guard += 1;
      }
    }
    expect(lock.phase).toBe("settling");
    lock.setTension(0.68);
    expect(lock.lastMessage).toContain("停止後の反応");
    advance(lock, puzzle.vault.personality.settlingDelaySeconds - 0.02);
    expect(lock.phase).toBe("settling");
    advance(lock, 0.04);
    expect(lock.phase).toBe("tension-ready");
  });

  it("Pelagicの接触深度は回転速度が高いと一時的に浅くなる", () => {
    const lock = new LockMechanism(createPuzzleFromSeed(90212, "observe"));
    const target = lock.puzzle.stages[0].target;
    lock.dial = (target + 99) % 100;
    const slowDepth = lock.contactDepth;
    lock.setRotationSpeed(1);
    expect(lock.contactDepth).toBeLessThan(slowDepth);
  });

  it("過剰なテンションは回復可能な噛み込みとなり、専門モードでは規定回数でロックアウトする", () => {
    const puzzle = createReferencePuzzle("expert");
    const lock = new LockMechanism(puzzle);
    alignGates(lock, puzzle);
    for (let count = 0; count < puzzle.difficulty.maxFaults; count += 1) {
      lock.setTension(0.96);
      advance(lock, 0.46);
      if (count < puzzle.difficulty.maxFaults - 1) {
        expect(lock.phase).toBe("jammed");
        lock.setTension(0);
        expect(lock.phase).toBe("tension-ready");
      }
    }
    expect(lock.phase).toBe("lockout");
    lock.reset();
    expect(lock.phase).toBe("dial");
    expect(lock.faultCount).toBe(0);
  });

  it("難易度プロファイルにより抵抗帯、座り時間、内部可視性が変わる", () => {
    const observe = createReferencePuzzle("observe").difficulty;
    const standard = createReferencePuzzle("standard").difficulty;
    const expert = createReferencePuzzle("expert").difficulty;
    const blind = createReferencePuzzle("blind").difficulty;
    expect(observe.tensionBand[1] - observe.tensionBand[0]).toBeGreaterThan(standard.tensionBand[1] - standard.tensionBand[0]);
    expect(expert.tensionBand[1] - expert.tensionBand[0]).toBeLessThan(standard.tensionBand[1] - standard.tensionBand[0]);
    expect(expert.fenceHoldSeconds).toBeLessThan(standard.fenceHoldSeconds);
    expect(observe.showInternalGatePositions).toBe(true);
    expect(standard.showInternalGatePositions).toBe(false);
    expect(blind.blindMode).toBe(true);
    expect(blind.showExactInstruction).toBe(false);
    expect(blind.showInternalGatePositions).toBe(false);
    expect(blind.maxFaults).toBeLessThan(expert.maxFaults);
    solve(createReferencePuzzle("blind"));
  });
});
