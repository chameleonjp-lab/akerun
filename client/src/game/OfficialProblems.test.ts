import { describe, expect, it } from "vitest";
import {
  createOfficialPuzzle,
  OFFICIAL_PROBLEM_CATALOG,
  createTrainingPuzzle,
} from "./GameDefinitions";
import { LockMechanism } from "./LockMechanism";
import { OFFICIAL_PROBLEM_BALANCE } from "./OfficialProblemBalance";

const advance = (lock: LockMechanism, seconds: number) => {
  for (let frame = 0; frame < Math.ceil(seconds * 90); frame += 1)
    lock.tick(1 / 90);
};

const solve = (problemId: string) => {
  const puzzle = createOfficialPuzzle(problemId);
  const lock = new LockMechanism(puzzle);
  for (let index = 0; index < puzzle.stages.length; index += 1) {
    const stage = puzzle.stages[index];
    let guard = 0;
    while (lock.stage === index && guard < 2400) {
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
  const tensionBand = puzzle.difficulty.tensionBand;
  lock.setTension((tensionBand[0] + tensionBand[1]) / 2);
  advance(lock, puzzle.difficulty.tensionHoldSeconds + 0.12);
  expect(lock.phase).toBe("fence-ready");
  const fenceBand = puzzle.difficulty.fenceBand;
  lock.setFenceTravel((fenceBand[0] + fenceBand[1]) / 2);
  advance(lock, puzzle.difficulty.fenceHoldSeconds + 0.12);
  expect(lock.phase).toBe("fence-seated");
  lock.setBoltTravel(0.84);
  advance(lock, 0.3);
  expect(lock.phase).toBe("boltwork-ready");
  lock.setHandleTurn(0.96);
  advance(lock, 0.3);
  expect(lock.opened).toBe(true);
};

describe("official puzzle catalog", () => {
  it("contains exactly 20 versioned problems with the planned tier split", () => {
    expect(OFFICIAL_PROBLEM_CATALOG).toHaveLength(20);
    expect(
      new Set(OFFICIAL_PROBLEM_CATALOG.map(item => item.problemId)).size
    ).toBe(20);
    expect(
      OFFICIAL_PROBLEM_CATALOG.filter(item => item.tier === "beginner")
    ).toHaveLength(5);
    expect(
      OFFICIAL_PROBLEM_CATALOG.filter(item => item.tier === "standard")
    ).toHaveLength(10);
    expect(
      OFFICIAL_PROBLEM_CATALOG.filter(item => item.tier === "advanced")
    ).toHaveLength(5);
  });

  it("keeps each problem's targets and false gates valid", () => {
    OFFICIAL_PROBLEM_CATALOG.forEach(catalog => {
      const puzzle = createOfficialPuzzle(catalog.problemId);
      expect(puzzle.problemVersion).toBe("V1");
      expect(puzzle.stages).toHaveLength(catalog.wheelCount);
      expect(new Set(puzzle.stages.map(stage => stage.target)).size).toBe(
        catalog.wheelCount
      );
      expect(puzzle.falseGates).toHaveLength(
        catalog.wheelCount * puzzle.vault.personality.falseGatesPerWheel
      );
      puzzle.falseGates.forEach(gate => {
        const target = puzzle.stages.find(
          stage => stage.wheel === gate.wheel
        )?.target;
        expect(gate.position).not.toBe(target);
      });
    });
  });

  it("opens every official problem through the existing mechanism", () => {
    OFFICIAL_PROBLEM_CATALOG.forEach(catalog => solve(catalog.problemId));
  });

  it("keeps measured dial baselines aligned with the score par values", () => {
    expect(OFFICIAL_PROBLEM_BALANCE).toHaveLength(20);
    OFFICIAL_PROBLEM_BALANCE.forEach(balance => {
      expect(balance.minimumDialSteps).toBe(balance.parDialSteps);
      const puzzle = createOfficialPuzzle(balance.problemId);
      expect(balance.falseGateCount).toBe(
        balance.wheelCount * puzzle.vault.personality.falseGatesPerWheel
      );
      expect(balance.minimumFalseGateContacts).toBe(
        OFFICIAL_PROBLEM_CATALOG.find(
          item => item.problemId === balance.problemId
        )?.parFalseGateContacts
      );
      expect(balance.totalPasses).toBeGreaterThan(balance.wheelCount);
      expect(balance.parFaults).toBe(
        OFFICIAL_PROBLEM_CATALOG.find(
          item => item.problemId === balance.problemId
        )?.parFaults
      );
    });

    const scores = OFFICIAL_PROBLEM_BALANCE.map(
      balance => balance.baselineScore
    );
    expect(Math.max(...scores) - Math.min(...scores)).toBeLessThanOrEqual(200);
  });

  it("provides four distinct training contracts", () => {
    expect(createTrainingPuzzle(1).vault.wheelCount).toBe(1);
    expect(createTrainingPuzzle(2).vault.wheelCount).toBe(2);
    expect(createTrainingPuzzle(3).vault.wheelCount).toBe(3);
    expect(createTrainingPuzzle(4).vault.wheelCount).toBe(3);
  });
});
