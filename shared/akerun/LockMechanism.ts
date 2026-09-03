/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * ホイール、フライ、ドライブカムの接続と切離しを抽象化し、抵抗・フェンス・錠ボルト・扉ボルトワークを扱う純粋な状態機械。
 */
import {
  createReferencePuzzle,
  type PuzzleDefinition,
  type TumblerStage,
  type TurnDirection,
} from "./GameDefinitions.ts";

export type { TumblerStage, TurnDirection } from "./GameDefinitions";
export type ProtocolPhase =
  | "dial"
  | "settling"
  | "tension-ready"
  | "tension-test"
  | "fence-ready"
  | "fence-seated"
  | "bolt-test"
  | "boltwork-ready"
  | "handle-test"
  | "jammed"
  | "open"
  | "lockout";
export type ResistanceState =
  | "idle"
  | "hard-stop"
  | "candidate"
  | "jammed"
  | "seated";
export type ContactProfile = "clear" | "edge" | "false-gate" | "true-gate";

export type LockMechanismSnapshot = {
  readonly dial: number;
  readonly stage: number;
  readonly tumblerValues: readonly number[];
  readonly locked: readonly boolean[];
  readonly lastDirection: TurnDirection;
  readonly phase: ProtocolPhase;
  readonly desiredTorque: number;
  readonly appliedTorque: number;
  readonly desiredFenceTravel: number;
  readonly fenceTravel: number;
  readonly desiredBoltTravel: number;
  readonly boltTravel: number;
  readonly desiredHandleTurn: number;
  readonly handleTurn: number;
  readonly faultCount: number;
  readonly opened: boolean;
  readonly lastRotationFalseGateContacts: number;
  readonly lastMessage: string;
  readonly stagePasses: number;
  readonly reversalCount: number;
  readonly tensionHold: number;
  readonly fenceHold: number;
  readonly boltHold: number;
  readonly handleHold: number;
  readonly overloadHold: number;
  readonly settlingElapsed: number;
  readonly rotationSpeed: number;
};

/** 後方互換のため、既存の基準手順を公開する。 */
export const TUMBLER_STAGES: readonly TumblerStage[] =
  createReferencePuzzle().stages;

const normalize = (value: number) => ((value % 100) + 100) % 100;
const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
const clampUnit = (value: number) =>
  Number.isFinite(value) ? clamp(value) : 0;

const signedDistance = (from: number, to: number) => {
  const raw = normalize(to - from);
  return raw > 50 ? raw - 100 : raw;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isUnitNumber = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1;

const isNonNegativeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const isNonNegativeInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const PROTOCOL_PHASES: readonly ProtocolPhase[] = [
  "dial",
  "settling",
  "tension-ready",
  "tension-test",
  "fence-ready",
  "fence-seated",
  "bolt-test",
  "boltwork-ready",
  "handle-test",
  "jammed",
  "open",
  "lockout",
];

export const isLockMechanismSnapshot = (
  value: unknown
): value is LockMechanismSnapshot => {
  if (!isRecord(value)) return false;
  const tumblerValues = value.tumblerValues;
  const locked = value.locked;
  return (
    typeof value.dial === "number" &&
    Number.isFinite(value.dial) &&
    value.dial >= 0 &&
    value.dial < 100 &&
    isNonNegativeInteger(value.stage) &&
    Array.isArray(tumblerValues) &&
    tumblerValues.every(
      item =>
        typeof item === "number" &&
        Number.isFinite(item) &&
        item >= 0 &&
        item < 100
    ) &&
    Array.isArray(locked) &&
    locked.every(item => typeof item === "boolean") &&
    (value.lastDirection === "cw" || value.lastDirection === "ccw") &&
    typeof value.phase === "string" &&
    PROTOCOL_PHASES.includes(value.phase as ProtocolPhase) &&
    isUnitNumber(value.desiredTorque) &&
    isUnitNumber(value.appliedTorque) &&
    isUnitNumber(value.desiredFenceTravel) &&
    isUnitNumber(value.fenceTravel) &&
    isUnitNumber(value.desiredBoltTravel) &&
    isUnitNumber(value.boltTravel) &&
    isUnitNumber(value.desiredHandleTurn) &&
    isUnitNumber(value.handleTurn) &&
    isNonNegativeInteger(value.faultCount) &&
    typeof value.opened === "boolean" &&
    isNonNegativeInteger(value.lastRotationFalseGateContacts) &&
    typeof value.lastMessage === "string" &&
    value.lastMessage.length <= 320 &&
    isNonNegativeInteger(value.stagePasses) &&
    isNonNegativeInteger(value.reversalCount) &&
    isNonNegativeNumber(value.tensionHold) &&
    isNonNegativeNumber(value.fenceHold) &&
    isNonNegativeNumber(value.boltHold) &&
    isNonNegativeNumber(value.handleHold) &&
    isNonNegativeNumber(value.overloadHold) &&
    isNonNegativeNumber(value.settlingElapsed) &&
    isUnitNumber(value.rotationSpeed)
  );
};

const SNAPSHOT_EPSILON = 0.000001;
const isNearlyZero = (value: number) => value <= SNAPSHOT_EPSILON;
const isNearly = (value: number, expected: number) =>
  Math.abs(value - expected) <= SNAPSHOT_EPSILON;

const hasNoActuatorState = (snapshot: LockMechanismSnapshot) =>
  isNearlyZero(snapshot.desiredTorque) &&
  isNearlyZero(snapshot.appliedTorque) &&
  isNearlyZero(snapshot.desiredFenceTravel) &&
  isNearlyZero(snapshot.fenceTravel) &&
  isNearlyZero(snapshot.desiredBoltTravel) &&
  isNearlyZero(snapshot.boltTravel) &&
  isNearlyZero(snapshot.desiredHandleTurn) &&
  isNearlyZero(snapshot.handleTurn) &&
  isNearlyZero(snapshot.tensionHold) &&
  isNearlyZero(snapshot.fenceHold) &&
  isNearlyZero(snapshot.boltHold) &&
  isNearlyZero(snapshot.handleHold) &&
  isNearlyZero(snapshot.overloadHold);

/**
 * 型として正しいだけでなく、指定された問題の実際の状態遷移から生成できるかを確認する。
 * これは入力履歴の完全な証明ではなく、壊れた端末保存値によるstage/phaseの飛び越しを防ぐためのガード。
 */
export const isCoherentLockMechanismSnapshot = (
  value: unknown,
  puzzle: PuzzleDefinition
): value is LockMechanismSnapshot => {
  if (!isLockMechanismSnapshot(value) || value.opened || value.phase === "open")
    return false;

  const stageCount = puzzle.stages.length;
  const wheelCount = puzzle.vault.wheelCount;
  if (
    stageCount === 0 ||
    stageCount !== wheelCount ||
    value.stage > stageCount ||
    value.tumblerValues.length !== wheelCount ||
    value.locked.length !== stageCount ||
    value.faultCount > puzzle.difficulty.maxFaults ||
    value.settlingElapsed >
      puzzle.vault.personality.settlingDelaySeconds + SNAPSHOT_EPSILON ||
    value.appliedTorque > value.desiredTorque + SNAPSHOT_EPSILON ||
    value.fenceTravel > value.desiredFenceTravel + SNAPSHOT_EPSILON ||
    value.boltTravel > value.desiredBoltTravel + SNAPSHOT_EPSILON ||
    value.handleTurn > value.desiredHandleTurn + SNAPSHOT_EPSILON
  ) {
    return false;
  }

  const stageWheels = puzzle.stages.map(stage => stage.wheel);
  if (
    new Set(stageWheels).size !== stageWheels.length ||
    puzzle.stages.some(
      stage =>
        !Number.isInteger(stage.wheel) ||
        stage.wheel < 0 ||
        stage.wheel >= wheelCount ||
        !Number.isFinite(stage.target) ||
        stage.target < 0 ||
        stage.target >= 100 ||
        !Number.isInteger(stage.passes) ||
        stage.passes <= 0 ||
        (stage.direction !== "cw" && stage.direction !== "ccw")
    )
  ) {
    return false;
  }

  const completedWheels = new Set(
    puzzle.stages.slice(0, value.stage).map(stage => stage.wheel)
  );
  for (let wheel = 0; wheel < wheelCount; wheel += 1) {
    if (value.locked[wheel] !== completedWheels.has(wheel)) return false;
  }
  for (const stage of puzzle.stages.slice(0, value.stage)) {
    if (
      !isNearly(value.tumblerValues[stage.wheel] ?? -1, normalize(stage.target))
    )
      return false;
  }

  if (value.phase === "dial") {
    const activeStage = puzzle.stages[value.stage];
    if (
      !activeStage ||
      value.stagePasses >= activeStage.passes ||
      !hasNoActuatorState(value)
    )
      return false;
  } else if (value.stagePasses !== 0) {
    return false;
  }

  if (
    value.phase !== "dial" &&
    value.phase !== "jammed" &&
    value.phase !== "lockout" &&
    value.stage !== stageCount
  ) {
    return false;
  }

  // ロックアウトはテンション／フェンス検証後にしか発生しない。
  // stageを飛ばした保存値を再開可能にすると、機構状態と操作履歴の
  // 対応が崩れる。
  if (value.phase === "lockout" && value.stage !== stageCount) return false;

  if (value.phase === "settling") {
    if (
      puzzle.vault.personality.settlingDelaySeconds <= 0 ||
      !hasNoActuatorState(value)
    )
      return false;
  }

  if (value.phase === "tension-ready") {
    if (
      value.stage !== stageCount ||
      value.desiredTorque > 0.02 ||
      value.appliedTorque > 0.02 ||
      !isNearlyZero(value.desiredFenceTravel) ||
      !isNearlyZero(value.fenceTravel) ||
      !isNearlyZero(value.desiredBoltTravel) ||
      !isNearlyZero(value.boltTravel) ||
      !isNearlyZero(value.desiredHandleTurn) ||
      !isNearlyZero(value.handleTurn) ||
      !isNearlyZero(value.tensionHold) ||
      !isNearlyZero(value.fenceHold) ||
      !isNearlyZero(value.boltHold) ||
      !isNearlyZero(value.handleHold) ||
      !isNearlyZero(value.overloadHold)
    )
      return false;
  }

  if (value.phase === "tension-test") {
    if (
      value.stage !== stageCount ||
      value.desiredTorque <= 0.02 ||
      value.appliedTorque <= 0.02 ||
      !isNearlyZero(value.desiredFenceTravel) ||
      !isNearlyZero(value.fenceTravel) ||
      !isNearlyZero(value.desiredBoltTravel) ||
      !isNearlyZero(value.boltTravel) ||
      !isNearlyZero(value.desiredHandleTurn) ||
      !isNearlyZero(value.handleTurn) ||
      value.tensionHold >= puzzle.difficulty.tensionHoldSeconds ||
      value.overloadHold >= 0.4
    )
      return false;
  }

  if (value.phase === "fence-ready") {
    if (
      value.stage !== stageCount ||
      !isNearlyZero(value.desiredTorque) ||
      !isNearlyZero(value.appliedTorque) ||
      !isNearlyZero(value.desiredBoltTravel) ||
      !isNearlyZero(value.boltTravel) ||
      !isNearlyZero(value.desiredHandleTurn) ||
      !isNearlyZero(value.handleTurn) ||
      !isNearlyZero(value.tensionHold) ||
      value.fenceHold >= puzzle.difficulty.fenceHoldSeconds ||
      !isNearlyZero(value.boltHold) ||
      !isNearlyZero(value.handleHold) ||
      value.overloadHold >= 0.24
    )
      return false;
  }

  if (value.phase === "fence-seated") {
    if (
      value.stage !== stageCount ||
      !isNearlyZero(value.desiredTorque) ||
      !isNearlyZero(value.appliedTorque) ||
      !isNearly(value.desiredFenceTravel, 0.72) ||
      !isNearly(value.fenceTravel, 0.72) ||
      value.desiredBoltTravel > 0.02 ||
      value.boltTravel > 0.02 ||
      !isNearlyZero(value.desiredHandleTurn) ||
      !isNearlyZero(value.handleTurn) ||
      !isNearlyZero(value.tensionHold) ||
      !isNearlyZero(value.fenceHold) ||
      !isNearlyZero(value.boltHold) ||
      !isNearlyZero(value.handleHold) ||
      !isNearlyZero(value.overloadHold)
    )
      return false;
  }

  if (value.phase === "bolt-test") {
    if (
      value.stage !== stageCount ||
      !isNearlyZero(value.desiredTorque) ||
      !isNearlyZero(value.appliedTorque) ||
      !isNearly(value.desiredFenceTravel, 0.72) ||
      !isNearly(value.fenceTravel, 0.72) ||
      value.desiredBoltTravel <= 0.02 ||
      value.boltTravel <= 0.02 ||
      !isNearlyZero(value.desiredHandleTurn) ||
      !isNearlyZero(value.handleTurn) ||
      !isNearlyZero(value.tensionHold) ||
      !isNearlyZero(value.fenceHold) ||
      value.boltHold >= 0.18 ||
      !isNearlyZero(value.handleHold) ||
      !isNearlyZero(value.overloadHold)
    )
      return false;
  }

  if (value.phase === "boltwork-ready") {
    if (
      value.stage !== stageCount ||
      !isNearlyZero(value.desiredTorque) ||
      !isNearlyZero(value.appliedTorque) ||
      !isNearly(value.desiredFenceTravel, 0.72) ||
      !isNearly(value.fenceTravel, 0.72) ||
      !isNearly(value.desiredBoltTravel, 1) ||
      !isNearly(value.boltTravel, 1) ||
      value.desiredHandleTurn > 0.02 ||
      value.handleTurn > 0.02 ||
      !isNearlyZero(value.tensionHold) ||
      !isNearlyZero(value.fenceHold) ||
      !isNearlyZero(value.boltHold) ||
      !isNearlyZero(value.handleHold) ||
      !isNearlyZero(value.overloadHold)
    )
      return false;
  }

  if (value.phase === "handle-test") {
    if (
      value.stage !== stageCount ||
      !isNearlyZero(value.desiredTorque) ||
      !isNearlyZero(value.appliedTorque) ||
      !isNearly(value.desiredFenceTravel, 0.72) ||
      !isNearly(value.fenceTravel, 0.72) ||
      !isNearly(value.desiredBoltTravel, 1) ||
      !isNearly(value.boltTravel, 1) ||
      value.desiredHandleTurn <= 0.02 ||
      value.handleTurn <= 0.02 ||
      !isNearlyZero(value.tensionHold) ||
      !isNearlyZero(value.fenceHold) ||
      !isNearlyZero(value.boltHold) ||
      value.handleHold >= 0.2 ||
      !isNearlyZero(value.overloadHold)
    )
      return false;
  }

  if (value.phase === "jammed" && !hasNoActuatorState(value)) return false;
  return true;
};

export class LockMechanism {
  readonly puzzle: PuzzleDefinition;
  dial = 0;
  stage = 0;
  readonly tumblerValues: number[];
  readonly locked: boolean[];
  lastDirection: TurnDirection = "cw";
  phase: ProtocolPhase = "dial";
  desiredTorque = 0;
  appliedTorque = 0;
  desiredFenceTravel = 0;
  fenceTravel = 0;
  desiredBoltTravel = 0;
  boltTravel = 0;
  desiredHandleTurn = 0;
  handleTurn = 0;
  faultCount = 0;
  opened = false;
  /** 直前のrotate呼び出しで通過した偽ゲート数。粗い入力でも中間接触を失わない。 */
  lastRotationFalseGateContacts = 0;
  lastMessage =
    "数字を当てるのではない。ドライブカムがフライを拾う順番を観察してください。";
  private stagePasses = 0;
  private reversalCount = 0;
  private tensionHold = 0;
  private fenceHold = 0;
  private boltHold = 0;
  private handleHold = 0;
  private overloadHold = 0;
  private settlingElapsed = 0;
  private rotationSpeed = 0;

  constructor(puzzle: PuzzleDefinition = createReferencePuzzle()) {
    this.puzzle = puzzle;
    this.tumblerValues = this.createInitialWheelValues();
    this.locked = puzzle.stages.map(() => false);
  }

  get activeStage(): TumblerStage | null {
    return this.phase === "dial"
      ? (this.puzzle.stages[this.stage] ?? null)
      : null;
  }

  get gatesAligned(): boolean {
    return this.stage >= this.puzzle.stages.length;
  }

  get currentPass(): number {
    return this.phase === "dial"
      ? Math.min(this.activeStage?.passes ?? 0, this.stagePasses + 1)
      : 0;
  }

  get requiredPasses(): number {
    return this.activeStage?.passes ?? 0;
  }

  /** 現在ドライブカムに拾われているホイール。ロック済みホイールは後続の回転から切り離される。 */
  get coupledWheels(): readonly number[] {
    const stage = this.activeStage;
    if (!stage) return [];
    const count = Math.min(stage.wheel + 1, this.stagePasses + 1);
    // ステージは外側の輪（W6）から始まる。拾われる輪もその輪から
    // 内側へ向かうため、配列の先頭（W1）を固定してはいけない。
    return Array.from({ length: count }, (_, index) => stage.wheel - index);
  }

  get driveCamAngle(): number {
    return (this.dial / 100) * Math.PI * 2 - Math.PI / 2;
  }

  /** 現在操作中のホイールで触れた、浅い偽ゲート。 */
  get falseGateAtDial() {
    const stage = this.activeStage;
    if (!stage) return null;
    return (
      this.puzzle.falseGates.find(
        gate => gate.wheel === stage.wheel && gate.position === this.dial
      ) ?? null
    );
  }

  get contactProfile(): ContactProfile {
    if (this.phase !== "dial") return "clear";
    if (this.falseGateAtDial) return "false-gate";
    if (this.activeStage?.target === this.dial) return "true-gate";
    const target = this.activeStage?.target;
    if (
      target !== undefined &&
      Math.min(
        Math.abs(target - this.dial),
        100 - Math.abs(target - this.dial)
      ) <= 1
    )
      return "edge";
    return "clear";
  }

  /** 現在の接触がフェンスへ与える相対的な深さ。観察用の数値であり、正解そのものではない。 */
  get contactDepth(): number {
    const personality = this.puzzle.vault.personality;
    const speedResponse =
      personality.id === "timing"
        ? this.rotationSpeed * personality.speedSensitivity * 0.12
        : 0;
    if (this.contactProfile === "true-gate")
      return clamp(1 - speedResponse, 0, 1);
    if (this.contactProfile === "false-gate") {
      return clamp(
        (this.falseGateAtDial?.depth ?? 0) +
          personality.falseGateSimilarity * 0.16 -
          speedResponse * 0.55,
        0,
        1
      );
    }
    if (this.contactProfile === "edge")
      return clamp(
        0.45 + personality.contactContrast * 0.2 - speedResponse * 0.4,
        0,
        1
      );
    return 0;
  }

  /** 金庫固有のホイールパック予圧と、現在の接触から得られる抵抗読み。 */
  get packResistance(): number {
    const { baseResistance, edgeHardness } = this.puzzle.vault.preload;
    const personality = this.puzzle.vault.personality;
    const contactLift =
      this.contactProfile === "true-gate"
        ? 0.08 + personality.contactContrast * 0.13
        : this.contactProfile === "false-gate"
          ? 0.05 + personality.falseGateSimilarity * 0.08
          : this.contactProfile === "edge"
            ? 0.035 + personality.contactContrast * 0.055
            : 0;
    const speedDrag = personality.speedSensitivity * this.rotationSpeed * 0.035;
    return clamp(
      baseResistance * 0.55 + edgeHardness * contactLift + speedDrag,
      0,
      1
    );
  }

  get fenceDropped(): boolean {
    return (
      this.phase === "fence-seated" ||
      this.phase === "bolt-test" ||
      this.phase === "boltwork-ready" ||
      this.phase === "handle-test" ||
      this.phase === "open"
    );
  }

  get isReady(): boolean {
    return (
      this.phase === "fence-ready" ||
      this.phase === "fence-seated" ||
      this.phase === "bolt-test" ||
      this.phase === "boltwork-ready" ||
      this.phase === "handle-test"
    );
  }

  /** 錠ボルトの拘束が外れ、扉内のボルトワークへ力が届く状態。 */
  get boltworkReleased(): boolean {
    return (
      this.phase === "boltwork-ready" ||
      this.phase === "handle-test" ||
      this.phase === "open"
    );
  }

  /** ハンドルに連動する扉側ロッキングボルトの退避量。 */
  get doorBoltTravel(): number {
    return this.opened ? 1 : this.handleTurn;
  }

  get remainingFaults(): number {
    return Math.max(0, this.puzzle.difficulty.maxFaults - this.faultCount);
  }

  get torqueCeiling(): number {
    if (
      this.phase === "fence-seated" ||
      this.phase === "bolt-test" ||
      this.phase === "boltwork-ready" ||
      this.phase === "handle-test" ||
      this.phase === "open"
    )
      return 0.14;
    if (!this.gatesAligned) return 0.38;
    return 0.78;
  }

  get fenceCeiling(): number {
    return this.phase === "fence-ready" || this.phase === "fence-seated"
      ? 0.72
      : 0.46;
  }

  get boltCeiling(): number {
    return this.phase === "fence-seated" ||
      this.phase === "bolt-test" ||
      this.phase === "boltwork-ready" ||
      this.phase === "handle-test" ||
      this.phase === "open"
      ? 1
      : 0.24;
  }

  get handleCeiling(): number {
    return this.phase === "boltwork-ready" ||
      this.phase === "handle-test" ||
      this.phase === "open"
      ? 1
      : 0;
  }

  /** 金庫ごとの扉側ボルト配置に応じた、ハンドルの必要回転量。 */
  get requiredHandleTurn(): number {
    return clamp(
      0.82 + this.puzzle.vault.boltLayout.handleResistance * 0.13,
      0.82,
      0.94
    );
  }

  get resistanceState(): ResistanceState {
    if (this.phase === "jammed" || this.phase === "lockout") return "jammed";
    if (
      this.phase === "fence-seated" ||
      this.phase === "bolt-test" ||
      this.phase === "boltwork-ready" ||
      this.phase === "handle-test" ||
      this.phase === "open"
    )
      return "seated";
    if (
      this.phase === "settling" ||
      this.phase === "tension-ready" ||
      this.phase === "tension-test" ||
      this.phase === "fence-ready"
    )
      return "candidate";
    return "idle";
  }

  get snapshot(): LockMechanismSnapshot {
    return {
      dial: this.dial,
      stage: this.stage,
      tumblerValues: [...this.tumblerValues],
      locked: [...this.locked],
      lastDirection: this.lastDirection,
      phase: this.phase,
      desiredTorque: this.desiredTorque,
      appliedTorque: this.appliedTorque,
      desiredFenceTravel: this.desiredFenceTravel,
      fenceTravel: this.fenceTravel,
      desiredBoltTravel: this.desiredBoltTravel,
      boltTravel: this.boltTravel,
      desiredHandleTurn: this.desiredHandleTurn,
      handleTurn: this.handleTurn,
      faultCount: this.faultCount,
      opened: this.opened,
      lastRotationFalseGateContacts: this.lastRotationFalseGateContacts,
      lastMessage: this.lastMessage,
      stagePasses: this.stagePasses,
      reversalCount: this.reversalCount,
      tensionHold: this.tensionHold,
      fenceHold: this.fenceHold,
      boltHold: this.boltHold,
      handleHold: this.handleHold,
      overloadHold: this.overloadHold,
      settlingElapsed: this.settlingElapsed,
      rotationSpeed: this.rotationSpeed,
    };
  }

  restore(snapshot: LockMechanismSnapshot) {
    if (
      !isCoherentLockMechanismSnapshot(snapshot, this.puzzle) ||
      snapshot.tumblerValues.length !== this.tumblerValues.length ||
      snapshot.locked.length !== this.locked.length
    ) {
      return false;
    }
    this.dial = normalize(snapshot.dial);
    this.stage = snapshot.stage;
    this.tumblerValues.splice(
      0,
      this.tumblerValues.length,
      ...snapshot.tumblerValues.map(value => normalize(value))
    );
    this.locked.splice(0, this.locked.length, ...snapshot.locked);
    this.lastDirection = snapshot.lastDirection;
    this.phase = snapshot.phase;
    this.desiredTorque = clamp(snapshot.desiredTorque);
    this.appliedTorque = clamp(snapshot.appliedTorque);
    this.desiredFenceTravel = clamp(snapshot.desiredFenceTravel);
    this.fenceTravel = clamp(snapshot.fenceTravel);
    this.desiredBoltTravel = clamp(snapshot.desiredBoltTravel);
    this.boltTravel = clamp(snapshot.boltTravel);
    this.desiredHandleTurn = clamp(snapshot.desiredHandleTurn);
    this.handleTurn = clamp(snapshot.handleTurn);
    this.faultCount = snapshot.faultCount;
    this.opened = false;
    this.lastRotationFalseGateContacts = snapshot.lastRotationFalseGateContacts;
    this.lastMessage = snapshot.lastMessage;
    this.stagePasses = snapshot.stagePasses;
    this.reversalCount = snapshot.reversalCount;
    this.tensionHold = snapshot.tensionHold;
    this.fenceHold = snapshot.fenceHold;
    this.boltHold = snapshot.boltHold;
    this.handleHold = snapshot.handleHold;
    this.overloadHold = snapshot.overloadHold;
    this.settlingElapsed = snapshot.settlingElapsed;
    this.rotationSpeed = clamp(snapshot.rotationSpeed);
    return true;
  }

  get protocolInstruction(): string {
    if (this.phase === "dial") {
      const stage = this.activeStage;
      if (!stage) return "ドライブカムを観察";
      if (this.puzzle.difficulty.showExactInstruction)
        return `輪 ${stage.wheel + 1}：${stage.instruction}`;
      return `輪 ${stage.wheel + 1}へフライを拾わせる。${stage.direction === "cw" ? "右" : "左"}回りの接触痕を探る`;
    }
    if (this.phase === "settling")
      return "ダイヤルを止め、停止後のわずかな反応を観察する";
    if (this.phase === "tension-ready")
      return "テンション・ハンドルで静かに負荷を掛ける";
    if (this.phase === "tension-test") return "抵抗針が沈む帯域で力を保つ";
    if (this.phase === "fence-ready")
      return "フェンスをゆっくり押し、座りを確かめる";
    if (this.phase === "fence-seated")
      return "フェンスを保持。ボルト・タブで後退量を試す";
    if (this.phase === "bolt-test")
      return "ロックボルトが退避し、ボルトワークが解放されることを確かめる";
    if (this.phase === "boltwork-ready")
      return "錠ボルトは退避済み。扉ハンドルでボルトワークを後退させる";
    if (this.phase === "handle-test")
      return `ハンドルを保持し、扉側ボルトが受け金から抜けるまで回す（必要回転 ${Math.round(this.requiredHandleTurn * 100)}%）`;
    if (this.phase === "jammed") return "力を抜いてから、整列の仮説を見直す";
    if (this.phase === "lockout")
      return "安全リンクが拘束。RESETで最初から再開";
    return "扉側ボルトが退避。ボルトワーク解放済み";
  }

  tick(delta: number) {
    if (
      !Number.isFinite(delta) ||
      delta <= 0 ||
      this.opened ||
      this.phase === "lockout"
    )
      return;
    const seconds = Math.min(0.25, delta);
    this.rotationSpeed = Math.max(0, this.rotationSpeed - seconds * 2.4);
    if (this.phase === "settling") this.advanceSettling(seconds);
    if (this.phase === "tension-test") this.advanceTension(seconds);
    if (this.phase === "fence-ready") this.advanceFence(seconds);
    if (this.phase === "bolt-test") this.advanceBolt(seconds);
    if (this.phase === "handle-test") this.advanceHandle(seconds);
  }

  rotate(steps: number) {
    this.lastRotationFalseGateContacts = 0;
    if (
      !Number.isFinite(steps) ||
      steps === 0 ||
      this.opened ||
      this.phase === "lockout"
    )
      return;
    if (this.phase !== "dial") {
      this.lastMessage =
        "今はダイヤルを回さない。前に出た物理部品の反応を確かめてください。";
      return;
    }

    const direction: TurnDirection = steps > 0 ? "cw" : "ccw";
    const count = Math.min(32, Math.max(1, Math.round(Math.abs(steps))));
    const delta = direction === "cw" ? 1 : -1;

    for (let index = 0; index < count; index += 1) {
      const current = this.activeStage;
      if (!current) return;
      const reverses = this.lastDirection !== direction;
      if (reverses) this.reversalCount += 1;
      this.lastDirection = direction;

      // 逆方向は機構を空転させるだけだが、ダイヤル自体は物理的に回る。
      // ここで位置更新まで捨てると、片方向入力に見えてしまい、観察と再現の
      // 両方が壊れる。正しい方向だけがホイールを拾い、通過を進める。
      if (direction !== current.direction) {
        this.dial = normalize(this.dial + delta);
        this.lastMessage = this.puzzle.difficulty.showExactInstruction
          ? `ドライブカムが空転しています。次は${current.direction === "cw" ? "右" : "左"}回りで輪 ${current.wheel + 1} のフライを拾います。`
          : "フライが離れ、ドライブカムが空転しています。次の方向反転を観察してください。";
        continue;
      }

      this.dial = normalize(this.dial + delta);
      for (const wheel of this.coupledWheels)
        this.tumblerValues[wheel] = this.dial;

      const falseGate = this.falseGateAtDial;
      if (falseGate) {
        this.lastRotationFalseGateContacts += 1;
        this.lastMessage = this.puzzle.difficulty.showFalseGatePositions
          ? `輪 ${current.wheel + 1} の浅い偽ゲートに触れました。深さ ${Math.round(falseGate.depth * 100)}%。フェンスは座りません。`
          : "浅い切欠きに触れ、フェンスがわずかに反発しました。音の減衰と戻りを確かめてください。";
        continue;
      }
      if (this.dial !== current.target) continue;
      this.stagePasses += 1;
      if (this.stagePasses < current.passes) {
        this.lastMessage = this.puzzle.difficulty.showExactInstruction
          ? `輪 ${current.wheel + 1} はまだフライの遊びの中です。${this.stagePasses + 1}回目に ${String(current.target).padStart(2, "0")} を通過します。`
          : `フライの接触が一段深くなりました。通過 ${this.stagePasses}/${current.passes}。`;
        continue;
      }

      this.tumblerValues[current.wheel] = current.target;
      this.locked[current.wheel] = true;
      this.stage += 1;
      this.stagePasses = 0;
      if (this.stage >= this.puzzle.stages.length) {
        this.settlingElapsed = 0;
        const settlingDelay =
          this.puzzle.vault.personality.settlingDelaySeconds;
        if (settlingDelay > 0) {
          this.phase = "settling";
          this.lastMessage =
            "全ホイールが止まりました。停止後の反応が落ち着くまで観察してください。";
        } else {
          this.phase = "tension-ready";
          this.lastMessage =
            "全ホイールのゲートが静止。フェンスが落ちるか、テンションで検証してください。";
        }
        return;
      }
      const next = this.activeStage;
      this.lastMessage =
        next && this.puzzle.difficulty.showExactInstruction
          ? `輪 ${current.wheel + 1} を残してフライが切れました。次は${next.direction === "cw" ? "右" : "左"}回りで輪 ${next.wheel + 1} を拾います。`
          : "一枚のホイールを残してフライが切れました。反転後の接触を観察してください。";
    }
  }

  setTension(value: number) {
    const torque = clampUnit(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase === "jammed") {
      if (torque <= 0.02) this.releaseJam();
      return;
    }
    if (this.phase === "settling") {
      if (torque > 0.02)
        this.lastMessage =
          "停止後の反応を確認してから、テンションを掛けてください。";
      return;
    }
    if (this.phase !== "tension-ready" && this.phase !== "tension-test") {
      if (torque > 0.02)
        this.lastMessage =
          "テンションは、全ゲートの仮説が整ってから検証します。";
      return;
    }
    this.desiredTorque = torque;
    this.appliedTorque = Math.min(torque, this.torqueCeiling);
    if (torque <= 0.02) {
      this.tensionHold = 0;
      this.overloadHold = 0;
      this.phase = "tension-ready";
      this.lastMessage = "力を抜きました。抵抗針が中立へ戻っています。";
    } else {
      this.phase = "tension-test";
      this.lastMessage = "荷重を読み取り中。抵抗針が沈む帯域を保ってください。";
    }
  }

  setFenceTravel(value: number) {
    const travel = clampUnit(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase === "jammed") {
      if (travel <= 0.02) this.releaseJam();
      return;
    }
    if (this.phase !== "fence-ready" && this.phase !== "fence-seated") {
      if (travel > 0.02)
        this.lastMessage = "フェンスは、抵抗が抜けた後だけゲートを探れます。";
      return;
    }
    if (this.phase === "fence-seated") return;
    this.desiredFenceTravel = travel;
    this.fenceTravel = Math.min(travel, this.fenceCeiling);
    if (travel <= 0.02) {
      this.fenceHold = 0;
      this.overloadHold = 0;
      this.lastMessage =
        "フェンスを戻しました。遊びを保ったまま再試行できます。";
    } else {
      this.lastMessage =
        "フェンスが各ゲートの縁を探っています。止まる位置を確かめてください。";
    }
  }

  setBoltTravel(value: number) {
    const travel = clampUnit(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase !== "fence-seated" && this.phase !== "bolt-test") {
      if (travel > 0.02)
        this.lastMessage = "ボルト・タブは、フェンスが座ってから試します。";
      return;
    }
    this.desiredBoltTravel = travel;
    this.boltTravel = Math.min(travel, this.boltCeiling);
    if (travel > 0.02 && this.phase === "fence-seated") {
      this.phase = "bolt-test";
      this.lastMessage =
        "ロックボルトをゆっくり退避させています。ボルトワークが滑らかに解放されるか確かめてください。";
    }
    if (travel <= 0.02 && this.phase === "bolt-test") {
      this.boltHold = 0;
      this.phase = "fence-seated";
      this.lastMessage = "ロックボルトを戻しました。フェンスは座ったままです。";
    }
  }

  /** ロックボルトの拘束が外れた後だけ、扉側ボルトをハンドルで連動させる。 */
  setHandleTurn(value: number) {
    const travel = clampUnit(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase !== "boltwork-ready" && this.phase !== "handle-test") {
      if (travel > 0.02)
        this.lastMessage =
          "扉ハンドルは、ロックボルトが完全に退避してからボルトワークへ届きます。";
      return;
    }
    this.desiredHandleTurn = travel;
    this.handleTurn = Math.min(travel, this.handleCeiling);
    if (travel > 0.02 && this.phase === "boltwork-ready") {
      this.phase = "handle-test";
      this.lastMessage =
        "ハンドルがキャリーバーを動かしています。扉側ボルトが受け金から抜けるまで回してください。";
    }
    if (travel <= 0.02 && this.phase === "handle-test") {
      this.handleHold = 0;
      this.phase = "boltwork-ready";
      this.lastMessage =
        "ハンドルを戻しました。ロックボルトは退避したままです。ボルトワークをもう一度回せます。";
    }
  }

  gateOffset(wheel: number): number {
    if (this.locked[wheel]) return 0;
    const stageForWheel = this.puzzle.stages.find(
      stage => stage.wheel === wheel
    );
    return stageForWheel
      ? signedDistance(this.tumblerValues[wheel], stageForWheel.target) / 50
      : 0;
  }

  /** 訓練3用。ダイヤル整列済みの状態から後半機構だけを体験させる。 */
  preparePostDialTraining() {
    this.dial = 0;
    this.stage = this.puzzle.stages.length;
    this.stagePasses = 0;
    this.locked.splice(
      0,
      this.locked.length,
      ...this.puzzle.stages.map(() => true)
    );
    this.tumblerValues.splice(
      0,
      this.tumblerValues.length,
      ...this.puzzle.stages.map(stage => stage.target)
    );
    this.phase = "tension-ready";
    this.desiredTorque = 0;
    this.appliedTorque = 0;
    this.desiredFenceTravel = 0;
    this.fenceTravel = 0;
    this.desiredBoltTravel = 0;
    this.boltTravel = 0;
    this.desiredHandleTurn = 0;
    this.handleTurn = 0;
    this.faultCount = 0;
    this.settlingElapsed = 0;
    this.rotationSpeed = 0;
    this.opened = false;
    this.lastMessage =
      "ゲートは整列済みです。テンション、フェンス、ロックボルト、扉ハンドルの順に操作してください。";
  }

  reset() {
    this.dial = 0;
    this.stage = 0;
    this.tumblerValues.splice(
      0,
      this.tumblerValues.length,
      ...this.createInitialWheelValues()
    );
    this.locked.splice(
      0,
      this.locked.length,
      ...this.puzzle.stages.map(() => false)
    );
    this.lastDirection = "cw";
    this.phase = "dial";
    this.stagePasses = 0;
    this.reversalCount = 0;
    this.desiredTorque = 0;
    this.appliedTorque = 0;
    this.desiredFenceTravel = 0;
    this.fenceTravel = 0;
    this.desiredBoltTravel = 0;
    this.boltTravel = 0;
    this.desiredHandleTurn = 0;
    this.handleTurn = 0;
    this.tensionHold = 0;
    this.fenceHold = 0;
    this.boltHold = 0;
    this.handleHold = 0;
    this.overloadHold = 0;
    this.settlingElapsed = 0;
    this.rotationSpeed = 0;
    this.faultCount = 0;
    this.lastRotationFalseGateContacts = 0;
    this.opened = false;
    this.lastMessage =
      "初期化しました。ドライブカムと最初のフライを観察してください。";
  }

  private createInitialWheelValues(): number[] {
    const offsets = [64, 63, 59, 47, 31];
    return Array.from({ length: this.puzzle.vault.wheelCount }, (_, wheel) => {
      const stageIndex = this.puzzle.stages.findIndex(
        stage => stage.wheel === wheel
      );
      const stage = this.puzzle.stages[stageIndex];
      return normalize(
        stage.target + offsets[Math.max(0, stageIndex) % offsets.length]
      );
    });
  }

  private advanceTension(delta: number) {
    const [minimum, maximum] = this.puzzle.difficulty.tensionBand;
    const stable =
      this.desiredTorque >= minimum &&
      this.desiredTorque <= maximum &&
      this.appliedTorque >= minimum;
    this.tensionHold = stable
      ? this.tensionHold + delta
      : Math.max(0, this.tensionHold - delta * 2);
    this.overloadHold =
      this.desiredTorque > 0.88 ? this.overloadHold + delta : 0;
    if (this.overloadHold >= 0.4) {
      this.registerJam("力を掛けすぎてロックボルトが噛み込みました。", false);
      return;
    }
    if (this.tensionHold >= this.puzzle.difficulty.tensionHoldSeconds) {
      this.phase = "fence-ready";
      this.desiredTorque = 0;
      this.appliedTorque = 0;
      this.tensionHold = 0;
      this.overloadHold = 0;
      this.lastMessage =
        "抵抗が一瞬抜けました。フェンス・レバーをゆっくり押して座りを確かめてください。";
    }
  }

  private advanceSettling(delta: number) {
    const delay = this.puzzle.vault.personality.settlingDelaySeconds;
    this.settlingElapsed += delta;
    if (this.settlingElapsed < delay) return;
    this.settlingElapsed = delay;
    this.phase = "tension-ready";
    this.lastMessage =
      "停止後の反応が落ち着きました。テンションを静かに掛けて抵抗を確かめてください。";
  }

  setRotationSpeed(value: number) {
    this.rotationSpeed = clampUnit(value);
  }

  private advanceFence(delta: number) {
    const [minimum, maximum] = this.puzzle.difficulty.fenceBand;
    const stable =
      this.desiredFenceTravel >= minimum &&
      this.desiredFenceTravel <= maximum &&
      this.fenceTravel >= minimum;
    this.fenceHold = stable
      ? this.fenceHold + delta
      : Math.max(0, this.fenceHold - delta * 2);
    this.overloadHold =
      this.desiredFenceTravel > 0.88 ? this.overloadHold + delta : 0;
    if (this.overloadHold >= 0.24) {
      this.registerJam(
        "フェンスを押し込みすぎ、ゲート縁で反発しました。",
        true
      );
      return;
    }
    if (this.fenceHold >= this.puzzle.difficulty.fenceHoldSeconds) {
      this.phase = "fence-seated";
      this.fenceTravel = 0.72;
      this.desiredFenceTravel = 0.72;
      this.fenceHold = 0;
      this.overloadHold = 0;
      this.lastMessage =
        "フェンスが全ゲートへ座りました。ロックボルトを退避させ、ボルトワークを解放してください。";
    }
  }

  private advanceBolt(delta: number) {
    const stable = this.desiredBoltTravel >= 0.72 && this.boltTravel >= 0.72;
    this.boltHold = stable
      ? this.boltHold + delta
      : Math.max(0, this.boltHold - delta * 2);
    if (this.boltHold >= 0.18) {
      this.phase = "boltwork-ready";
      this.boltTravel = 1;
      this.desiredBoltTravel = 1;
      this.boltHold = 0;
      this.lastMessage =
        "ロックボルトが退避。扉側ボルトはまだ受け金に掛かっています。ハンドルでキャリーバーを回してください。";
    }
  }

  private advanceHandle(delta: number) {
    const required = this.requiredHandleTurn;
    const stable =
      this.desiredHandleTurn >= required && this.handleTurn >= required;
    this.handleHold = stable
      ? this.handleHold + delta
      : Math.max(0, this.handleHold - delta * 2);
    if (this.handleHold >= 0.2) {
      this.opened = true;
      this.phase = "open";
      this.handleTurn = 1;
      this.desiredHandleTurn = 1;
      this.handleHold = 0;
      this.lastMessage = `扉側ボルトが受け金から後退。ボルトワーク解放完了。${this.puzzle.reward.title}を発見しました。`;
    }
  }

  private registerJam(message: string, rollback: boolean) {
    this.faultCount += 1;
    if (this.faultCount >= this.puzzle.difficulty.maxFaults) {
      this.phase = "lockout";
      this.lastMessage = `${message} 安全リンクが拘束しました。RESETで再開してください。`;
      return;
    }
    if (rollback) this.rollbackStages();
    this.desiredTorque = 0;
    this.appliedTorque = 0;
    this.desiredFenceTravel = 0;
    this.fenceTravel = 0;
    this.desiredBoltTravel = 0;
    this.boltTravel = 0;
    this.desiredHandleTurn = 0;
    this.handleTurn = 0;
    this.tensionHold = 0;
    this.fenceHold = 0;
    this.boltHold = 0;
    this.handleHold = 0;
    this.overloadHold = 0;
    this.phase = "jammed";
    this.lastMessage = `${message} 力を抜くと安全に復帰できます。`;
  }

  private rollbackStages() {
    const rollback = Math.min(this.puzzle.difficulty.faultRollback, this.stage);
    for (let count = 0; count < rollback; count += 1) {
      const releasedWheel = this.puzzle.stages[this.stage - 1].wheel;
      const releasedTarget = this.puzzle.stages[this.stage - 1].target;
      this.stage -= 1;
      this.locked[releasedWheel] = false;
      this.tumblerValues[releasedWheel] = normalize(
        releasedTarget + (this.lastDirection === "cw" ? 9 : -9)
      );
    }
    this.stagePasses = 0;
  }

  private releaseJam() {
    this.phase = this.gatesAligned ? "tension-ready" : "dial";
    this.lastMessage = this.gatesAligned
      ? "噛み込みが解けました。テンションを低く保ち、抵抗をもう一度確かめてください。"
      : "噛み込みが解けました。外れたホイールを、フライの接続順に再調整してください。";
  }
}
