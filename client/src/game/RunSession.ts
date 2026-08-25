import type { PuzzleDefinition } from "./GameDefinitions";

export type RunResult = {
  readonly elapsedTime: number;
  readonly faultCount: number;
  readonly totalDialSteps: number;
  readonly excessDialSteps: number;
  readonly falseGateContacts: number;
  readonly observationAccuracy: number;
  readonly score: number;
  readonly problemId: string;
  readonly problemVersion: string;
  readonly difficulty: string;
};

export type RunSessionSnapshot = {
  readonly elapsedTime: number;
  readonly faultCount: number;
  readonly totalDialSteps: number;
  readonly excessDialSteps: number;
  readonly falseGateContacts: number;
  readonly observationAccuracy: number;
  readonly score: number;
  readonly finished: boolean;
};

const nonNegative = (value: number) =>
  Math.max(0, Number.isFinite(value) ? value : 0);

/**
 * The verified ranking contract sends elapsed time as integer milliseconds.
 * Quantize once before calculating the score so the browser and server use
 * the same value at Math.round half-step boundaries.
 */
export const quantizeElapsedTime = (seconds: number) =>
  Math.round(nonNegative(seconds) * 1000) / 1000;

export const calculateRunScore = (
  problem: PuzzleDefinition,
  elapsedTime: number,
  faultCount: number,
  totalDialSteps: number,
  falseGateContacts: number
): number => {
  const parTime = problem.parTime ?? 60;
  const parDialSteps = problem.parDialSteps ?? 600;
  const parFaults = Math.max(0, problem.parFaults ?? 0);
  const weight = problem.difficultyWeight ?? 1;
  const timePart = Math.round((parTime - elapsedTime) * 120);
  const dialPart = Math.round((parDialSteps - totalDialSteps) * 6);
  const difficultyPart = Math.round(weight * 1000);
  const faultPart = Math.round((nonNegative(faultCount) - parFaults) * 650);
  const falseGatePart = Math.round(nonNegative(falseGateContacts) * 35);
  return Math.max(
    0,
    8000 + difficultyPart + timePart + dialPart - faultPart - falseGatePart
  );
};

export class RunSession {
  readonly problem: PuzzleDefinition;
  private elapsedTime = 0;
  private faultCount = 0;
  private totalDialSteps = 0;
  private falseGateContacts = 0;
  private finished = false;
  private result: RunResult | null = null;

  constructor(problem: PuzzleDefinition) {
    this.problem = problem;
  }

  advance(seconds: number) {
    if (this.finished || !Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsedTime += seconds;
  }

  recordDial(steps: number) {
    if (this.finished) return;
    this.totalDialSteps += Math.max(0, Math.round(Math.abs(steps)));
  }

  recordFalseGate() {
    if (this.finished) return;
    this.falseGateContacts += 1;
  }

  recordFault(count = 1) {
    if (this.finished) return;
    this.faultCount += Math.max(0, Math.round(count));
  }

  finish(
    overrides?: Partial<Pick<RunResult, "elapsedTime" | "faultCount">>
  ): RunResult {
    if (this.result) return this.result;
    const elapsedTime = quantizeElapsedTime(overrides?.elapsedTime ?? this.elapsedTime);
    const faultCount = Math.max(
      0,
      Math.round(overrides?.faultCount ?? this.faultCount)
    );
    const parDialSteps = this.problem.parDialSteps ?? 600;
    const excessDialSteps = Math.max(0, this.totalDialSteps - parDialSteps);
    const observationAccuracy = Math.max(
      0,
      Math.min(100, 100 - this.falseGateContacts * 4 - faultCount * 8)
    );
    this.result = {
      elapsedTime,
      faultCount,
      totalDialSteps: this.totalDialSteps,
      excessDialSteps,
      falseGateContacts: this.falseGateContacts,
      observationAccuracy,
      score: calculateRunScore(
        this.problem,
        elapsedTime,
        faultCount,
        this.totalDialSteps,
        this.falseGateContacts
      ),
      problemId: this.problem.problemId ?? this.problem.id,
      problemVersion: this.problem.problemVersion ?? "DEV",
      difficulty: this.problem.problemTier ?? this.problem.difficulty.id,
    };
    this.finished = true;
    return this.result;
  }

  get snapshot(): RunSessionSnapshot {
    const score =
      this.result?.score ??
      calculateRunScore(
        this.problem,
        this.elapsedTime,
        this.faultCount,
        this.totalDialSteps,
        this.falseGateContacts
      );
    return {
      elapsedTime: this.result?.elapsedTime ?? this.elapsedTime,
      faultCount: this.result?.faultCount ?? this.faultCount,
      totalDialSteps: this.totalDialSteps,
      excessDialSteps: Math.max(
        0,
        this.totalDialSteps - (this.problem.parDialSteps ?? 600)
      ),
      falseGateContacts: this.falseGateContacts,
      observationAccuracy:
        this.result?.observationAccuracy ??
        Math.max(0, 100 - this.falseGateContacts * 4 - this.faultCount * 8),
      score,
      finished: this.finished,
    };
  }

  get isFinished() {
    return this.finished;
  }

  get finalResult() {
    return this.result;
  }
}
