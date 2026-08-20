/**
 * Vault Tumbler Lab — 真鍮の機械製図室。
 * 外部音源を使わず、ダイヤル、抵抗、フェンス、ボルトを短い合成金属音へ変換する。
 */
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

  /** 偽ゲートの浅い接触。縁音より短く、座り切らない鈍い反発を返す。 */
  falseGate(depth: number, hardness = 0.5) {
    if (!this.mechanicalCueReady(0.095)) return;
    const shallow = Math.min(1, Math.max(0, depth));
    this.strike(498 + shallow * 84 + hardness * 54, 0.034, 0.042, "square");
    this.strike(178, 0.07, 0.034 + shallow * 0.022, "triangle", 0.008);
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
