/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * ホイール、フライ、ドライブカムの接続と切離しを抽象化し、抵抗・フェンス・錠ボルト・扉ボルトワークを扱う純粋な状態機械。
 */
import { createReferencePuzzle, type PuzzleDefinition, type TumblerStage, type TurnDirection } from "./GameDefinitions";

export type { TumblerStage, TurnDirection } from "./GameDefinitions";
export type ProtocolPhase = "dial" | "tension-ready" | "tension-test" | "fence-ready" | "fence-seated" | "bolt-test" | "boltwork-ready" | "handle-test" | "jammed" | "open" | "lockout";
export type ResistanceState = "idle" | "hard-stop" | "candidate" | "jammed" | "seated";
export type ContactProfile = "clear" | "edge" | "false-gate" | "true-gate";

/** 後方互換のため、既存の基準手順を公開する。 */
export const TUMBLER_STAGES: readonly TumblerStage[] = createReferencePuzzle().stages;

const normalize = (value: number) => ((value % 100) + 100) % 100;
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const signedDistance = (from: number, to: number) => {
  const raw = normalize(to - from);
  return raw > 50 ? raw - 100 : raw;
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
  lastMessage = "数字を当てるのではない。ドライブカムがフライを拾う順番を観察してください。";
  private stagePasses = 0;
  private reversalCount = 0;
  private tensionHold = 0;
  private fenceHold = 0;
  private boltHold = 0;
  private handleHold = 0;
  private overloadHold = 0;

  constructor(puzzle: PuzzleDefinition = createReferencePuzzle()) {
    this.puzzle = puzzle;
    this.tumblerValues = this.createInitialWheelValues();
    this.locked = puzzle.stages.map(() => false);
  }

  get activeStage(): TumblerStage | null {
    return this.phase === "dial" ? this.puzzle.stages[this.stage] ?? null : null;
  }

  get gatesAligned(): boolean {
    return this.stage >= this.puzzle.stages.length;
  }

  get currentPass(): number {
    return this.phase === "dial" ? Math.min(this.activeStage?.passes ?? 0, this.stagePasses + 1) : 0;
  }

  get requiredPasses(): number {
    return this.activeStage?.passes ?? 0;
  }

  /** 現在ドライブカムに拾われているホイール。ロック済みホイールは後続の回転から切り離される。 */
  get coupledWheels(): readonly number[] {
    const stage = this.activeStage;
    if (!stage) return [];
    const count = Math.min(stage.wheel + 1, this.stagePasses + 1);
    return Array.from({ length: count }, (_, index) => index);
  }

  get driveCamAngle(): number {
    return (this.dial / 100) * Math.PI * 2 - Math.PI / 2;
  }

  /** 現在操作中のホイールで触れた、浅い偽ゲート。 */
  get falseGateAtDial() {
    const stage = this.activeStage;
    if (!stage) return null;
    return this.puzzle.falseGates.find((gate) => gate.wheel === stage.wheel && gate.position === this.dial) ?? null;
  }

  get contactProfile(): ContactProfile {
    if (this.phase !== "dial") return "clear";
    if (this.falseGateAtDial) return "false-gate";
    if (this.activeStage?.target === this.dial) return "true-gate";
    const target = this.activeStage?.target;
    if (target !== undefined && Math.min(Math.abs(target - this.dial), 100 - Math.abs(target - this.dial)) <= 1) return "edge";
    return "clear";
  }

  /** 現在の接触がフェンスへ与える相対的な深さ。観察用の数値であり、正解そのものではない。 */
  get contactDepth(): number {
    if (this.contactProfile === "true-gate") return 1;
    if (this.contactProfile === "false-gate") return this.falseGateAtDial?.depth ?? 0;
    if (this.contactProfile === "edge") return 0.58;
    return 0;
  }

  /** 金庫固有のホイールパック予圧と、現在の接触から得られる抵抗読み。 */
  get packResistance(): number {
    const { baseResistance, edgeHardness } = this.puzzle.vault.preload;
    const contactLift = this.contactProfile === "true-gate" ? 0.18 : this.contactProfile === "false-gate" ? 0.1 : this.contactProfile === "edge" ? 0.06 : 0;
    return clamp(baseResistance * 0.55 + edgeHardness * contactLift, 0, 1);
  }

  get fenceDropped(): boolean {
    return this.phase === "fence-seated" || this.phase === "bolt-test" || this.phase === "boltwork-ready" || this.phase === "handle-test" || this.phase === "open";
  }

  get isReady(): boolean {
    return this.phase === "fence-ready" || this.phase === "fence-seated" || this.phase === "bolt-test" || this.phase === "boltwork-ready" || this.phase === "handle-test";
  }

  /** 錠ボルトの拘束が外れ、扉内のボルトワークへ力が届く状態。 */
  get boltworkReleased(): boolean {
    return this.phase === "boltwork-ready" || this.phase === "handle-test" || this.phase === "open";
  }

  /** ハンドルに連動する扉側ロッキングボルトの退避量。 */
  get doorBoltTravel(): number {
    return this.opened ? 1 : this.handleTurn;
  }

  get remainingFaults(): number {
    return Math.max(0, this.puzzle.difficulty.maxFaults - this.faultCount);
  }

  get torqueCeiling(): number {
    if (this.phase === "fence-seated" || this.phase === "bolt-test" || this.phase === "boltwork-ready" || this.phase === "handle-test" || this.phase === "open") return 0.14;
    if (!this.gatesAligned) return 0.38;
    return 0.78;
  }

  get fenceCeiling(): number {
    return this.phase === "fence-ready" || this.phase === "fence-seated" ? 0.72 : 0.46;
  }

  get boltCeiling(): number {
    return this.phase === "fence-seated" || this.phase === "bolt-test" || this.phase === "boltwork-ready" || this.phase === "handle-test" || this.phase === "open" ? 1 : 0.24;
  }

  get handleCeiling(): number {
    return this.phase === "boltwork-ready" || this.phase === "handle-test" || this.phase === "open" ? 1 : 0;
  }

  /** 金庫ごとの扉側ボルト配置に応じた、ハンドルの必要回転量。 */
  get requiredHandleTurn(): number {
    return clamp(0.82 + this.puzzle.vault.boltLayout.handleResistance * 0.13, 0.82, 0.94);
  }

  get resistanceState(): ResistanceState {
    if (this.phase === "jammed" || this.phase === "lockout") return "jammed";
    if (this.phase === "fence-seated" || this.phase === "bolt-test" || this.phase === "boltwork-ready" || this.phase === "handle-test" || this.phase === "open") return "seated";
    if (this.phase === "tension-ready" || this.phase === "tension-test" || this.phase === "fence-ready") return "candidate";
    return "idle";
  }

  get protocolInstruction(): string {
    if (this.phase === "dial") {
      const stage = this.activeStage;
      if (!stage) return "ドライブカムを観察";
      if (this.puzzle.difficulty.showExactInstruction) return `輪 ${stage.wheel + 1}：${stage.instruction}`;
      return `輪 ${stage.wheel + 1}へフライを拾わせる。${stage.direction === "cw" ? "右" : "左"}回りの接触痕を探る`;
    }
    if (this.phase === "tension-ready") return "テンション・ハンドルで静かに負荷を掛ける";
    if (this.phase === "tension-test") return "抵抗針が沈む帯域で力を保つ";
    if (this.phase === "fence-ready") return "フェンスをゆっくり押し、座りを確かめる";
    if (this.phase === "fence-seated") return "フェンスを保持。ボルト・タブで後退量を試す";
    if (this.phase === "bolt-test") return "ロックボルトが退避し、ボルトワークが解放されることを確かめる";
    if (this.phase === "boltwork-ready") return "錠ボルトは退避済み。扉ハンドルでボルトワークを後退させる";
    if (this.phase === "handle-test") return `ハンドルを保持し、扉側ボルトが受け金から抜けるまで回す（必要回転 ${Math.round(this.requiredHandleTurn * 100)}%）`;
    if (this.phase === "jammed") return "力を抜いてから、整列の仮説を見直す";
    if (this.phase === "lockout") return "安全リンクが拘束。RESETで最初から再開";
    return "扉側ボルトが退避。ボルトワーク解放済み";
  }

  tick(delta: number) {
    if (!Number.isFinite(delta) || delta <= 0 || this.opened || this.phase === "lockout") return;
    const seconds = Math.min(0.25, delta);
    if (this.phase === "tension-test") this.advanceTension(seconds);
    if (this.phase === "fence-ready") this.advanceFence(seconds);
    if (this.phase === "bolt-test") this.advanceBolt(seconds);
    if (this.phase === "handle-test") this.advanceHandle(seconds);
  }

  rotate(steps: number) {
    if (!Number.isFinite(steps) || steps === 0 || this.opened || this.phase === "lockout") return;
    if (this.phase !== "dial") {
      this.lastMessage = "今はダイヤルを回さない。前に出た物理部品の反応を確かめてください。";
      return;
    }

    const direction: TurnDirection = steps > 0 ? "cw" : "ccw";
    const count = Math.min(32, Math.max(1, Math.round(Math.abs(steps))));
    const delta = direction === "cw" ? 1 : -1;

    for (let index = 0; index < count; index += 1) {
      const current = this.activeStage;
      if (!current) return;
      if (direction !== current.direction) {
        this.lastDirection = direction;
        this.lastMessage = this.puzzle.difficulty.showExactInstruction
          ? `ドライブカムが空転しています。次は${current.direction === "cw" ? "右" : "左"}回りで輪 ${current.wheel + 1} のフライを拾います。`
          : "フライが離れ、ドライブカムが空転しています。次の方向反転を観察してください。";
        return;
      }

      if (this.lastDirection !== direction) this.reversalCount += 1;
      this.lastDirection = direction;
      this.dial = normalize(this.dial + delta);
      for (const wheel of this.coupledWheels) this.tumblerValues[wheel] = this.dial;

      const falseGate = this.falseGateAtDial;
      if (falseGate) {
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
        this.phase = "tension-ready";
        this.lastMessage = "全ホイールのゲートが静止。フェンスが落ちるか、テンションで検証してください。";
        return;
      }
      const next = this.activeStage;
      this.lastMessage = next && this.puzzle.difficulty.showExactInstruction
        ? `輪 ${current.wheel + 1} を残してフライが切れました。次は${next.direction === "cw" ? "右" : "左"}回りで輪 ${next.wheel + 1} を拾います。`
        : "一枚のホイールを残してフライが切れました。反転後の接触を観察してください。";
    }
  }

  setTension(value: number) {
    const torque = clamp(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase === "jammed") {
      if (torque <= 0.02) this.releaseJam();
      return;
    }
    if (this.phase !== "tension-ready" && this.phase !== "tension-test") {
      if (torque > 0.02) this.lastMessage = "テンションは、全ゲートの仮説が整ってから検証します。";
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
    const travel = clamp(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase === "jammed") {
      if (travel <= 0.02) this.releaseJam();
      return;
    }
    if (this.phase !== "fence-ready" && this.phase !== "fence-seated") {
      if (travel > 0.02) this.lastMessage = "フェンスは、抵抗が抜けた後だけゲートを探れます。";
      return;
    }
    if (this.phase === "fence-seated") return;
    this.desiredFenceTravel = travel;
    this.fenceTravel = Math.min(travel, this.fenceCeiling);
    if (travel <= 0.02) {
      this.fenceHold = 0;
      this.overloadHold = 0;
      this.lastMessage = "フェンスを戻しました。遊びを保ったまま再試行できます。";
    } else {
      this.lastMessage = "フェンスが各ゲートの縁を探っています。止まる位置を確かめてください。";
    }
  }

  setBoltTravel(value: number) {
    const travel = clamp(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase !== "fence-seated" && this.phase !== "bolt-test") {
      if (travel > 0.02) this.lastMessage = "ボルト・タブは、フェンスが座ってから試します。";
      return;
    }
    this.desiredBoltTravel = travel;
    this.boltTravel = Math.min(travel, this.boltCeiling);
    if (travel > 0.02 && this.phase === "fence-seated") {
      this.phase = "bolt-test";
      this.lastMessage = "ロックボルトをゆっくり退避させています。ボルトワークが滑らかに解放されるか確かめてください。";
    }
    if (travel <= 0.02 && this.phase === "bolt-test") {
      this.boltHold = 0;
      this.phase = "fence-seated";
      this.lastMessage = "ロックボルトを戻しました。フェンスは座ったままです。";
    }
  }

  /** ロックボルトの拘束が外れた後だけ、扉側ボルトをハンドルで連動させる。 */
  setHandleTurn(value: number) {
    const travel = clamp(value);
    if (this.opened || this.phase === "lockout") return;
    if (this.phase !== "boltwork-ready" && this.phase !== "handle-test") {
      if (travel > 0.02) this.lastMessage = "扉ハンドルは、ロックボルトが完全に退避してからボルトワークへ届きます。";
      return;
    }
    this.desiredHandleTurn = travel;
    this.handleTurn = Math.min(travel, this.handleCeiling);
    if (travel > 0.02 && this.phase === "boltwork-ready") {
      this.phase = "handle-test";
      this.lastMessage = "ハンドルがキャリーバーを動かしています。扉側ボルトが受け金から抜けるまで回してください。";
    }
    if (travel <= 0.02 && this.phase === "handle-test") {
      this.handleHold = 0;
      this.phase = "boltwork-ready";
      this.lastMessage = "ハンドルを戻しました。ロックボルトは退避したままです。ボルトワークをもう一度回せます。";
    }
  }

  gateOffset(wheel: number): number {
    if (this.locked[wheel]) return 0;
    const stageForWheel = this.puzzle.stages.find((stage) => stage.wheel === wheel);
    return stageForWheel ? signedDistance(this.tumblerValues[wheel], stageForWheel.target) / 50 : 0;
  }

  reset() {
    this.dial = 0;
    this.stage = 0;
    this.tumblerValues.splice(0, this.tumblerValues.length, ...this.createInitialWheelValues());
    this.locked.splice(0, this.locked.length, ...this.puzzle.stages.map(() => false));
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
    this.faultCount = 0;
    this.opened = false;
    this.lastMessage = "初期化しました。ドライブカムと最初のフライを観察してください。";
  }

  private createInitialWheelValues(): number[] {
    const offsets = [64, 63, 59, 47, 31];
    return Array.from({ length: this.puzzle.vault.wheelCount }, (_, wheel) => {
      const stageIndex = this.puzzle.stages.findIndex((stage) => stage.wheel === wheel);
      const stage = this.puzzle.stages[stageIndex];
      return normalize(stage.target + offsets[Math.max(0, stageIndex) % offsets.length]);
    });
  }

  private advanceTension(delta: number) {
    const [minimum, maximum] = this.puzzle.difficulty.tensionBand;
    const stable = this.desiredTorque >= minimum && this.desiredTorque <= maximum && this.appliedTorque >= minimum;
    this.tensionHold = stable ? this.tensionHold + delta : Math.max(0, this.tensionHold - delta * 2);
    this.overloadHold = this.desiredTorque > 0.88 ? this.overloadHold + delta : 0;
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
      this.lastMessage = "抵抗が一瞬抜けました。フェンス・レバーをゆっくり押して座りを確かめてください。";
    }
  }

  private advanceFence(delta: number) {
    const [minimum, maximum] = this.puzzle.difficulty.fenceBand;
    const stable = this.desiredFenceTravel >= minimum && this.desiredFenceTravel <= maximum && this.fenceTravel >= minimum;
    this.fenceHold = stable ? this.fenceHold + delta : Math.max(0, this.fenceHold - delta * 2);
    this.overloadHold = this.desiredFenceTravel > 0.88 ? this.overloadHold + delta : 0;
    if (this.overloadHold >= 0.24) {
      this.registerJam("フェンスを押し込みすぎ、ゲート縁で反発しました。", true);
      return;
    }
    if (this.fenceHold >= this.puzzle.difficulty.fenceHoldSeconds) {
      this.phase = "fence-seated";
      this.fenceTravel = 0.72;
      this.desiredFenceTravel = 0.72;
      this.fenceHold = 0;
      this.overloadHold = 0;
      this.lastMessage = "フェンスが全ゲートへ座りました。ロックボルトを退避させ、ボルトワークを解放してください。";
    }
  }

  private advanceBolt(delta: number) {
    const stable = this.desiredBoltTravel >= 0.72 && this.boltTravel >= 0.72;
    this.boltHold = stable ? this.boltHold + delta : Math.max(0, this.boltHold - delta * 2);
    if (this.boltHold >= 0.18) {
      this.phase = "boltwork-ready";
      this.boltTravel = 1;
      this.desiredBoltTravel = 1;
      this.boltHold = 0;
      this.lastMessage = "ロックボルトが退避。扉側ボルトはまだ受け金に掛かっています。ハンドルでキャリーバーを回してください。";
    }
  }

  private advanceHandle(delta: number) {
    const required = this.requiredHandleTurn;
    const stable = this.desiredHandleTurn >= required && this.handleTurn >= required;
    this.handleHold = stable ? this.handleHold + delta : Math.max(0, this.handleHold - delta * 2);
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
      this.tumblerValues[releasedWheel] = normalize(releasedTarget + (this.lastDirection === "cw" ? 9 : -9));
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
