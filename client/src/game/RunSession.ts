import type { PuzzleDefinition } from "./GameDefinitions";
import { isLockMechanismSnapshot, type LockMechanismSnapshot } from "./LockMechanism";
import { isRunTrace, RunTraceRecorder, type RunTrace, type RunTraceKind } from "./RunTrace";

export type RunResult = {
  readonly elapsedTime: number;
  readonly faultCount: number;
  readonly totalDialSteps: number;
  readonly excessDialSteps: number;
  /** 物理的に通過した偽ゲートの総数。不可避な基準通過も含む表示用の値。 */
  readonly falseGateContacts: number;
  /** 基準通過数を超えた、スコア計算上の偽ゲート接触数。 */
  readonly avoidableFalseGateContacts?: number;
  readonly observationAccuracy: number;
  readonly score: number;
  readonly problemId: string;
  readonly problemVersion: string;
  readonly difficulty: string;
  /** サーバーで再生する、順序付きの操作履歴。旧保存結果では未設定。 */
  readonly operationTrace?: RunTrace;
};

export type RunSessionSnapshot = {
  readonly elapsedTime: number;
  readonly faultCount: number;
  readonly totalDialSteps: number;
  readonly excessDialSteps: number;
  readonly falseGateContacts: number;
  readonly avoidableFalseGateContacts: number;
  readonly observationAccuracy: number;
  readonly score: number;
  readonly finished: boolean;
  readonly operationTrace?: RunTrace;
};

export type RunCheckpoint = {
  readonly runElapsed: number;
  readonly mechanism: LockMechanismSnapshot;
  readonly session: RunSessionSnapshot;
};

const nonNegative = (value: number) =>
  Math.max(0, Number.isFinite(value) ? value : 0);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

const isRunSessionSnapshot = (value: unknown): value is RunSessionSnapshot => {
  if (!isRecord(value)) return false;
  return isNonNegativeNumber(value.elapsedTime)
    && isNonNegativeInteger(value.faultCount)
    && isNonNegativeInteger(value.totalDialSteps)
    && isNonNegativeInteger(value.excessDialSteps)
    && isNonNegativeInteger(value.falseGateContacts)
    && isNonNegativeInteger(value.avoidableFalseGateContacts)
    && typeof value.observationAccuracy === "number"
    && Number.isFinite(value.observationAccuracy)
    && value.observationAccuracy >= 0
    && value.observationAccuracy <= 100
    && isNonNegativeInteger(value.score)
    && value.finished === false
    && (value.operationTrace === undefined || isRunTrace(value.operationTrace));
};

export const isRunCheckpoint = (value: unknown): value is RunCheckpoint => {
  if (!isRecord(value)) return false;
  const runElapsed = value.runElapsed;
  return isNonNegativeNumber(runElapsed)
    && runElapsed <= 1800
    && isLockMechanismSnapshot(value.mechanism)
    && !value.mechanism.opened
    && value.mechanism.phase !== "open"
    && isRunSessionSnapshot(value.session);
};

export const avoidableFalseGateContacts = (
  problem: PuzzleDefinition,
  observedContacts: number,
) => Math.max(
  0,
  nonNegative(observedContacts) - nonNegative(problem.parFalseGateContacts ?? 0),
);

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
  private readonly trace = new RunTraceRecorder();

  constructor(problem: PuzzleDefinition) {
    this.problem = problem;
  }

  advance(seconds: number) {
    if (this.finished || !Number.isFinite(seconds) || seconds <= 0) return;
    this.elapsedTime += seconds;
  }

  recordRotation(steps: number) {
    if (this.finished) return;
    const count = Math.max(0, Math.round(Math.abs(steps)));
    this.totalDialSteps += count;
    if (count > 0) this.trace.recordRotation(this.elapsedTime, steps);
  }

  /** 旧呼び出し元との互換を保ちながら、符号付き回転を記録する。 */
  recordDial(steps: number) {
    this.recordRotation(steps);
  }

  recordActuator(kind: Exclude<RunTraceKind, "rotate">, value: number) {
    if (this.finished) return;
    this.trace.recordActuator(this.elapsedTime, kind, value);
  }

  recordFalseGate() {
    if (this.finished) return;
    this.falseGateContacts += 1;
  }

  recordFault(count = 1) {
    if (this.finished) return;
    this.faultCount += Math.max(0, Math.round(count));
  }

  restore(snapshot: RunSessionSnapshot) {
    if (!isRunSessionSnapshot(snapshot)) return false;
    this.elapsedTime = snapshot.elapsedTime;
    this.faultCount = snapshot.faultCount;
    this.totalDialSteps = snapshot.totalDialSteps;
    this.falseGateContacts = snapshot.falseGateContacts;
    this.finished = false;
    this.result = null;
    this.trace.restore(snapshot.operationTrace);
    return true;
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
    const avoidableContacts = avoidableFalseGateContacts(this.problem, this.falseGateContacts);
    const observationAccuracy = Math.max(
      0,
      Math.min(100, 100 - avoidableContacts * 4 - faultCount * 8)
    );
    this.result = {
      elapsedTime,
      faultCount,
      totalDialSteps: this.totalDialSteps,
      excessDialSteps,
      falseGateContacts: this.falseGateContacts,
      avoidableFalseGateContacts: avoidableContacts,
      observationAccuracy,
      score: calculateRunScore(
        this.problem,
        elapsedTime,
        faultCount,
        this.totalDialSteps,
        avoidableContacts
      ),
      problemId: this.problem.problemId ?? this.problem.id,
      problemVersion: this.problem.problemVersion ?? "DEV",
      difficulty: this.problem.problemTier ?? this.problem.difficulty.id,
      operationTrace: this.trace.snapshot,
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
        avoidableFalseGateContacts(this.problem, this.falseGateContacts)
      );
    const avoidableContacts = avoidableFalseGateContacts(this.problem, this.falseGateContacts);
    return {
      elapsedTime: this.result?.elapsedTime ?? this.elapsedTime,
      faultCount: this.result?.faultCount ?? this.faultCount,
      totalDialSteps: this.totalDialSteps,
      excessDialSteps: Math.max(
        0,
        this.totalDialSteps - (this.problem.parDialSteps ?? 600)
      ),
      falseGateContacts: this.falseGateContacts,
      avoidableFalseGateContacts: this.result?.avoidableFalseGateContacts ?? avoidableContacts,
      observationAccuracy:
        this.result?.observationAccuracy ??
        Math.max(0, 100 - avoidableContacts * 4 - this.faultCount * 8),
      score,
      finished: this.finished,
      operationTrace: this.trace.snapshot,
    };
  }

  get isFinished() {
    return this.finished;
  }

  get finalResult() {
    return this.result;
  }
}
