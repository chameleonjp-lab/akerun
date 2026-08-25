/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * 外部音源を使わず、ダイヤル、抵抗、フェンス、ボルトを短い合成金属音へ変換する。
 */
export type AudioSampleId = "idle" | "edge" | "false-gate" | "pickup" | "deep-contact" | "fence" | "bolt";

export type AudioSampleDefinition = {
  readonly id: AudioSampleId;
  readonly title: string;
  readonly description: string;
  readonly visualMeaning: string;
};

export type FalseGateToneProfile = {
  readonly primaryFrequency: number;
  readonly secondaryFrequency: number;
  readonly primaryDuration: number;
  readonly secondaryDuration: number;
  readonly primaryGain: number;
  readonly secondaryGain: number;
};

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/**
 * 偽ゲートの音色を金庫固有の類似度から決める純粋関数。
 * Nocturneは正規ゲートに近い音を返すが、画面・抵抗の差まで消さない。
 */
export const getFalseGateToneProfile = (
  depth: number,
  hardness = 0.5,
  similarity = 0,
): FalseGateToneProfile => {
  const shallow = clamp(depth);
  const edge = clamp(hardness);
  const blend = clamp(similarity);
  const falsePrimary = 498 + shallow * 84 + edge * 54;
  const falseSecondary = 178;
  const primaryFrequency = falsePrimary + (612 - falsePrimary) * blend;
  const secondaryFrequency = falseSecondary + (306 - falseSecondary) * blend;
  const primaryDuration = 0.034 + blend * 0.028;
  const secondaryDuration = 0.07 + blend * 0.045;
  const primaryGain = 0.042 + blend * 0.018;
  const secondaryGain = 0.034 + shallow * 0.022 + blend * 0.012;
  return {
    primaryFrequency,
    secondaryFrequency,
    primaryDuration,
    secondaryDuration,
    primaryGain,
    secondaryGain,
  };
};

export const AUDIO_SAMPLE_DEFINITIONS: readonly AudioSampleDefinition[] = [
  { id: "idle", title: "空転", description: "フライが輪を拾わず、ドライブカムだけが回る音。", visualMeaning: "画面では大きな整列変化が起きません。" },
  { id: "edge", title: "ゲート縁", description: "ゲートの端に触れた軽い金属音。正解確定ではありません。", visualMeaning: "接触深度は浅く、候補を記録できます。" },
  { id: "false-gate", title: "偽ゲート", description: "一瞬だけ入りかける、短く鈍い反発音。", visualMeaning: "フェンスは最後まで下降せず、別の候補と比べます。" },
  { id: "pickup", title: "フライ接続", description: "フライが次の輪を拾う擦過音。", visualMeaning: "通過回数や操作中の輪が変わります。" },
  { id: "deep-contact", title: "深い接触", description: "正規ゲートに近づいたときの、低く長い接触音。", visualMeaning: "抵抗と接触深度を画面でも確認します。" },
  { id: "fence", title: "フェンス", description: "フェンスが座り、機構の後半へ進める音。", visualMeaning: "テンションからフェンス操作へ移ります。" },
  { id: "bolt", title: "ボルト", description: "ロックボルトと扉側ボルトが動く重いリンク音。", visualMeaning: "扉ハンドルへ進める状態を示します。" },
];

export class AudioFeedback {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private lastTickAt = 0;
  private lastResistanceAt = 0;
  private lastMechanicalCueAt = 0;

  get isMuted() {
    return this.muted;
  }

  enableFromGesture() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.34;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === "suspended") void this.context.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.34;
  }

  dialTick(direction: "cw" | "ccw", speed: number, preload = 0.5) {
    if (!this.ready() || !this.context) return;
    const now = this.context.currentTime;
    const normalizedSpeed = Math.min(1, Math.max(0, speed));
    const interval = 0.058 - normalizedSpeed * 0.042;
    if (now - this.lastTickAt < interval) return;
    this.lastTickAt = now;
    const materialBias = Math.min(1, Math.max(0, preload));
    const directionBase = (direction === "cw" ? 1510 : 1380) - materialBias * 130;
    const pitch = directionBase * (1 + normalizedSpeed * 0.31);
    const duration = 0.038 - normalizedSpeed * 0.016;
    const gain = 0.095 + normalizedSpeed * 0.085 + materialBias * 0.025;
    this.strike(pitch, duration, gain, "square");
    this.strike(pitch * 2.02, duration * 0.68, gain * (0.18 + normalizedSpeed * 0.22), "sine", 0.002);
    if (normalizedSpeed > 0.62) this.strike(pitch * 0.56, duration * 1.2, gain * 0.28, "triangle", 0.004);
  }

  flyPickup(depth: number, stickiness = 0.5) {
    if (!this.ready()) return;
    const normalizedDepth = Math.min(1, Math.max(0, depth));
    const grip = Math.min(1, Math.max(0, stickiness));
    this.strike(420 + normalizedDepth * 130 - grip * 42, 0.055 + grip * 0.03, 0.085 + grip * 0.035, "triangle");
    this.strike(840 + normalizedDepth * 220, 0.03 + grip * 0.014, 0.04, "sine", 0.01);
  }

  flyRelease() {
    if (!this.ready()) return;
    this.strike(236, 0.045, 0.07, "square");
  }

  /** フライがどの輪にも掛からず、ドライブカムだけが回る鈍い空転音。 */
  camIdle() {
    if (!this.mechanicalCueReady(0.1)) return;
    this.strike(164, 0.055, 0.06, "triangle");
    this.strike(246, 0.032, 0.024, "sine", 0.008);
  }

  /** ゲートの縁をなぞる軽い金属接触音。正解確定ではない聴覚的なダミー手掛かり。 */
  gateEdge(hardness = 0.5) {
    if (!this.mechanicalCueReady(0.072)) return;
    const edge = Math.min(1, Math.max(0, hardness));
    this.strike(840 + edge * 180, 0.027, 0.044 + edge * 0.018, "sine");
    this.strike(386 - edge * 48, 0.048 + edge * 0.018, 0.04, "triangle", 0.006);
  }

  /** 正規ゲートへ深く接触したときの、短く低い金属共鳴。 */
  deepContact() {
    if (!this.ready()) return;
    this.strike(612, 0.12, 0.14, "triangle");
    this.strike(306, 0.18, 0.095, "sine", 0.018);
  }

  /** 偽ゲートの浅い接触。縁音より短く、座り切らない鈍い反発を返す。 */
  falseGate(depth: number, hardness = 0.5, similarity = 0) {
    if (!this.mechanicalCueReady(0.095)) return;
    const tone = getFalseGateToneProfile(depth, hardness, similarity);
    this.strike(tone.primaryFrequency, tone.primaryDuration, tone.primaryGain, "square");
    this.strike(tone.secondaryFrequency, tone.secondaryDuration, tone.secondaryGain, "triangle", 0.008);
  }

  /** フライが遊びの中で次の輪へ近づく擦過音。 */
  flyBrush(depth: number, stickiness = 0.5) {
    if (!this.mechanicalCueReady(0.11)) return;
    const normalizedDepth = Math.min(1, Math.max(0, depth));
    const grip = Math.min(1, Math.max(0, stickiness));
    this.strike(286 + normalizedDepth * 78 - grip * 28, 0.042 + grip * 0.028, 0.042 + normalizedDepth * 0.018, "square");
  }

  tensionLoad(amount: number) {
    if (!this.ready() || !this.context) return;
    const now = this.context.currentTime;
    if (now - this.lastResistanceAt < 0.09) return;
    this.lastResistanceAt = now;
    const pressure = Math.min(1, Math.max(0, amount));
    this.strike(156 - pressure * 42, 0.08, 0.045 + pressure * 0.05, "triangle");
    this.strike(468 - pressure * 92, 0.045, 0.02 + pressure * 0.028, "sine", 0.008);
  }

  tensionCandidate() {
    if (!this.ready()) return;
    this.strike(312, 0.13, 0.14, "triangle");
    this.strike(624, 0.06, 0.065, "sine", 0.026);
  }

  tensionStop() {
    if (!this.ready()) return;
    this.strike(104, 0.12, 0.17, "square");
    this.strike(72, 0.16, 0.1, "triangle", 0.02);
  }

  fenceProbe(amount: number) {
    if (!this.ready()) return;
    const travel = Math.min(1, Math.max(0, amount));
    this.strike(430 - travel * 110, 0.05, 0.06, "sine");
  }

  fenceSeat() {
    if (!this.ready()) return;
    this.strike(196, 0.15, 0.22, "triangle");
    this.strike(392, 0.075, 0.105, "sine", 0.036);
  }

  boltSlide(amount: number) {
    if (!this.ready()) return;
    const travel = Math.min(1, Math.max(0, amount));
    this.strike(128 + travel * 42, 0.09, 0.07 + travel * 0.05, "triangle");
  }

  /** キャリーバーが複数の扉側ボルトを引き込む、低く長い金属の摺動音。 */
  boltworkSlide(amount: number) {
    if (!this.mechanicalCueReady(0.085)) return;
    const travel = Math.min(1, Math.max(0, amount));
    this.strike(96 + travel * 34, 0.13, 0.085 + travel * 0.045, "triangle");
    this.strike(184 + travel * 46, 0.082, 0.052, "square", 0.014);
  }

  /** ロックボルトが外れ、ハンドルにボルトワークがつながった瞬間の重いリンク音。 */
  boltworkRelease() {
    if (!this.ready()) return;
    this.strike(142, 0.19, 0.2, "triangle");
    this.strike(284, 0.095, 0.085, "sine", 0.028);
  }

  gateLatch() {
    if (!this.ready()) return;
    this.strike(680, 0.095, 0.24, "triangle");
    this.strike(1360, 0.055, 0.12, "sine", 0.018);
  }

  unlockRelease() {
    if (!this.ready()) return;
    this.strike(184, 0.38, 0.34, "triangle");
    this.strike(92, 0.58, 0.25, "sine", 0.075);
    this.strike(392, 0.18, 0.15, "square", 0.13);
    this.strike(118, 0.64, 0.2, "triangle", 0.42);
    this.strike(245, 0.31, 0.14, "square", 0.74);
    this.strike(74, 0.82, 0.17, "sine", 1.02);
    this.strike(560, 0.11, 0.09, "sine", 1.32);
  }

  safetyFault() {
    if (!this.ready()) return;
    this.strike(118, 0.18, 0.23, "square");
    this.strike(71, 0.28, 0.18, "triangle", 0.035);
    this.strike(510, 0.06, 0.08, "sine", 0.045);
  }

  preview(sampleId: AudioSampleId) {
    if (!this.context) return;
    if (this.context.state === "suspended") {
      void this.context.resume().then(() => this.preview(sampleId)).catch(() => undefined);
      return;
    }
    if (sampleId === "idle") this.camIdle();
    if (sampleId === "edge") this.gateEdge(0.55);
    if (sampleId === "false-gate") this.falseGate(0.42, 0.62);
    if (sampleId === "pickup") this.flyPickup(0.7, 0.5);
    if (sampleId === "deep-contact") this.deepContact();
    if (sampleId === "fence") this.fenceSeat();
    if (sampleId === "bolt") this.boltworkRelease();
  }

  dispose() {
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
    this.master = null;
  }

  private ready() {
    return Boolean(this.context && this.master && !this.muted && this.context.state === "running");
  }

  private mechanicalCueReady(interval: number) {
    if (!this.ready() || !this.context) return false;
    const now = this.context.currentTime;
    if (now - this.lastMechanicalCueAt < interval) return false;
    this.lastMechanicalCueAt = now;
    return true;
  }

  private strike(frequency: number, duration: number, gain: number, type: OscillatorType, delay = 0) {
    if (!this.context || !this.master) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * 0.56), start + duration);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}
