import type { PuzzleDefinition } from "./GameDefinitions";
import {
  isLockMechanismSnapshot,
  type LockMechanismSnapshot,
} from "./LockMechanism";
import {
  isRunTrace,
  RunTraceRecorder,
  type RunTrace,
  type RunTraceKind,
} from "./RunTrace";
import {
  calculateAkerunScore,
  observationAccuracy,
  scoreExcessDialSteps,
} from "../../../shared/akerun/ScoreContract";

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
const safeNonNegativeInteger = (value: number) =>
  Number.isFinite(value)
    ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(value)))
    : 0;
export const MAX_RUN_TIME_SECONDS = 1_800;
const CHECKPOINT_TIME_EPSILON = 0.001;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isNonEmptyString = (value: unknown, maxLength = 128): value is string =>
  typeof value === "string" &&
  value.trim().length > 0 &&
  value.length <= maxLength;

const isRunSessionSnapshot = (value: unknown): value is RunSessionSnapshot => {
  if (!isRecord(value)) return false;
  const elapsedTime = value.elapsedTime;
  const operationTrace = value.operationTrace;
  const validBase =
    isNonNegativeNumber(elapsedTime) &&
    elapsedTime <= MAX_RUN_TIME_SECONDS &&
    isNonNegativeInteger(value.faultCount) &&
    isNonNegativeInteger(value.totalDialSteps) &&
    isNonNegativeInteger(value.excessDialSteps) &&
    isNonNegativeInteger(value.falseGateContacts) &&
    isNonNegativeInteger(value.avoidableFalseGateContacts) &&
    typeof value.observationAccuracy === "number" &&
    Number.isFinite(value.observationAccuracy) &&
    value.observationAccuracy >= 0 &&
    value.observationAccuracy <= 100 &&
    isNonNegativeInteger(value.score) &&
    value.finished === false;
  if (!validBase) return false;
  return (
    operationTrace === undefined ||
    (isRunTrace(operationTrace) &&
      operationTrace.events.every(
        ([atMs]) => atMs <= Math.ceil(elapsedTime * 1000)
      ))
  );
};

export const isRunCheckpoint = (value: unknown): value is RunCheckpoint => {
  if (!isRecord(value)) return false;
  const runElapsed = value.runElapsed;
  const session = value.session;
  return (
    isNonNegativeNumber(runElapsed) &&
    runElapsed <= MAX_RUN_TIME_SECONDS &&
    isLockMechanismSnapshot(value.mechanism) &&
    !value.mechanism.opened &&
    value.mechanism.phase !== "open" &&
    isRunSessionSnapshot(session) &&
    Math.abs(runElapsed - session.elapsedTime) <= CHECKPOINT_TIME_EPSILON
  );
};

/**
 * Local storage and retry records are untrusted input. Keep malformed result
 * objects out of the ranking queue and the result HUD instead of letting a
 * single NaN/string field poison comparisons or Canvas text.
 */
export const isRunResult = (value: unknown): value is RunResult => {
  if (!isRecord(value)) return false;
  const elapsedTime = value.elapsedTime;
  const operationTrace = value.operationTrace;
  const validBase =
    isNonNegativeNumber(elapsedTime) &&
    elapsedTime <= MAX_RUN_TIME_SECONDS &&
    isNonNegativeInteger(value.faultCount) &&
    isNonNegativeInteger(value.totalDialSteps) &&
    isNonNegativeInteger(value.excessDialSteps) &&
    isNonNegativeInteger(value.falseGateContacts) &&
    (value.avoidableFalseGateContacts === undefined ||
      isNonNegativeInteger(value.avoidableFalseGateContacts)) &&
    typeof value.observationAccuracy === "number" &&
    Number.isFinite(value.observationAccuracy) &&
    value.observationAccuracy >= 0 &&
    value.observationAccuracy <= 100 &&
    isNonNegativeInteger(value.score) &&
    isNonEmptyString(value.problemId) &&
    isNonEmptyString(value.problemVersion) &&
    isNonEmptyString(value.difficulty);
  if (!validBase) return false;
  return (
    operationTrace === undefined ||
    (isRunTrace(operationTrace) &&
      operationTrace.events.every(
        ([atMs]) => atMs <= Math.ceil(elapsedTime * 1000)
      ))
  );
};

export const avoidableFalseGateContacts = (
  problem: PuzzleDefinition,
  observedContacts: number
) =>
  Math.max(
    0,
    nonNegative(observedContacts) -
      nonNegative(problem.parFalseGateContacts ?? 0)
  );

/**
 * The verified ranking contract sends elapsed time as integer milliseconds.
 * Quantize once before calculating the score so the browser and server use
 * the same value at Math.round half-step boundaries.
 */
export const quantizeElapsedTime = (seconds: number) =>
  Math.min(
    MAX_RUN_TIME_SECONDS,
    Math.round(nonNegative(seconds) * 1000) / 1000
  );

export const calculateRunScore = (
  problem: PuzzleDefinition,
  elapsedTime: number,
  faultCount: number,
  totalDialSteps: number,
  avoidableFalseGateContacts: number
): number =>
  calculateAkerunScore(
    problem,
    Math.min(MAX_RUN_TIME_SECONDS, nonNegative(elapsedTime)),
    faultCount,
    totalDialSteps,
    avoidableFalseGateContacts
  );

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
    this.elapsedTime = Math.min(
      MAX_RUN_TIME_SECONDS,
      this.elapsedTime + seconds
    );
  }

  recordRotation(steps: number) {
    if (this.finished || !Number.isFinite(steps)) return;
    const count = safeNonNegativeInteger(Math.abs(steps));
    this.totalDialSteps = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.totalDialSteps + count
    );
    if (count > 0) this.trace.recordRotation(this.elapsedTime, steps);
  }

  /** 旧呼び出し元との互換を保ちながら、符号付き回転を記録する。 */
  recordDial(steps: number) {
    this.recordRotation(steps);
  }

  recordActuator(kind: Exclude<RunTraceKind, "rotate">, value: number) {
    if (this.finished || !Number.isFinite(value)) return;
    this.trace.recordActuator(this.elapsedTime, kind, value);
  }

  recordFalseGate() {
    if (this.finished) return;
    this.falseGateContacts = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.falseGateContacts + 1
    );
  }

  recordFault(count = 1) {
    if (this.finished) return;
    this.faultCount = Math.min(
      Number.MAX_SAFE_INTEGER,
      this.faultCount + safeNonNegativeInteger(count)
    );
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
    const requestedElapsed = overrides?.elapsedTime;
    const elapsedTime = quantizeElapsedTime(
      Number.isFinite(requestedElapsed)
        ? (requestedElapsed as number)
        : this.elapsedTime
    );
    const requestedFaults = overrides?.faultCount;
    const faultCount = safeNonNegativeInteger(
      Number.isFinite(requestedFaults)
        ? (requestedFaults as number)
        : this.faultCount
    );
    const excessDialSteps = scoreExcessDialSteps(
      this.problem,
      this.totalDialSteps
    );
    const avoidableContacts = avoidableFalseGateContacts(
      this.problem,
      this.falseGateContacts
    );
    const accuracy = observationAccuracy(avoidableContacts, faultCount);
    this.result = {
      elapsedTime,
      faultCount,
      totalDialSteps: this.totalDialSteps,
      excessDialSteps,
      falseGateContacts: this.falseGateContacts,
      avoidableFalseGateContacts: avoidableContacts,
      observationAccuracy: accuracy,
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
    const avoidableContacts = avoidableFalseGateContacts(
      this.problem,
      this.falseGateContacts
    );
    return {
      elapsedTime: this.result?.elapsedTime ?? this.elapsedTime,
      faultCount: this.result?.faultCount ?? this.faultCount,
      totalDialSteps: this.totalDialSteps,
      excessDialSteps: scoreExcessDialSteps(this.problem, this.totalDialSteps),
      falseGateContacts: this.falseGateContacts,
      avoidableFalseGateContacts:
        this.result?.avoidableFalseGateContacts ?? avoidableContacts,
      observationAccuracy:
        this.result?.observationAccuracy ??
        observationAccuracy(avoidableContacts, this.faultCount),
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
