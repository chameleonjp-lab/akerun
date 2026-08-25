import { describe, expect, it } from "vitest";
import { createOfficialPuzzle } from "./GameDefinitions";
import { RunSession, calculateRunScore, quantizeElapsedTime } from "./RunSession";

describe("RunSession", () => {
  it("tracks dial movement, false gates, faults, and excess movement", () => {
    const problem = createOfficialPuzzle("AKERUN-10-V1");
    const session = new RunSession(problem);
    session.advance(12.5);
    session.recordDial(4);
    session.recordDial(-3);
    session.recordFalseGate();
    session.recordFault();
    const result = session.finish();
    expect(result.elapsedTime).toBeCloseTo(12.5);
    expect(result.totalDialSteps).toBe(7);
    expect(result.falseGateContacts).toBe(1);
    expect(result.faultCount).toBe(1);
    expect(result.excessDialSteps).toBe(0);
    expect(result.score).toBeGreaterThan(0);
  });

  it("does not change a finished result when finish is called again", () => {
    const problem = createOfficialPuzzle("AKERUN-01-V1");
    const session = new RunSession(problem);
    const first = session.finish({ elapsedTime: 20, faultCount: 0 });
    session.advance(40);
    session.recordDial(100);
    expect(session.finish()).toEqual(first);
  });

  it("keeps the problem difficulty in the score calculation", () => {
    const beginner = createOfficialPuzzle("AKERUN-01-V1");
    const advanced = createOfficialPuzzle("AKERUN-20-V1");
    expect(calculateRunScore(advanced, 40, 0, 400, 0)).toBeGreaterThan(
      calculateRunScore(beginner, 40, 0, 400, 0)
    );
  });

  it("uses each problem's par faults as the scoring baseline", () => {
    const problem = createOfficialPuzzle("AKERUN-10-V1");
    const standardFaults = calculateRunScore(
      problem,
      problem.parTime ?? 0,
      problem.parFaults ?? 0,
      problem.parDialSteps ?? 0,
      0
    );
    const cleanRun = calculateRunScore(
      problem,
      problem.parTime ?? 0,
      0,
      problem.parDialSteps ?? 0,
      0
    );
    const extraFault = calculateRunScore(
      problem,
      problem.parTime ?? 0,
      (problem.parFaults ?? 0) + 1,
      problem.parDialSteps ?? 0,
      0
    );
    expect(cleanRun - standardFaults).toBe(650);
    expect(standardFaults - extraFault).toBe(650);
  });

  it("quantizes elapsed time before the score is calculated", () => {
    expect(quantizeElapsedTime(1.23456)).toBe(1.235);
    const problem = createOfficialPuzzle("AKERUN-01-V1");
    const session = new RunSession(problem);
    const result = session.finish({ elapsedTime: 1.23456, faultCount: 0 });
    expect(result.elapsedTime).toBe(1.235);
    expect(result.score).toBe(calculateRunScore(problem, 1.235, 0, 0, 0));
  });
});
