/**
 * Vault Tumbler Lab — モバイル端末向けの控えめな触覚フィードバック。
 * Vibration API がない環境では必ず無操作で終了し、ゲーム進行を妨げない。
 */
export type HapticCue = "idle" | "edge" | "false-gate" | "pickup" | "latch" | "tension" | "seat" | "boltwork" | "fault" | "unlock";

const PATTERNS: Readonly<Record<HapticCue, VibratePattern>> = {
  idle: 8,
  edge: [10, 32, 10],
  "false-gate": [9, 24, 7],
  pickup: [16, 20, 12],
  latch: [18, 28, 18],
  tension: [12, 28, 12],
  seat: [30, 42, 20],
  boltwork: [22, 46, 32],
  fault: [46, 38, 46],
  unlock: [26, 54, 36, 54, 74],
};

const MIN_INTERVAL_MS: Readonly<Record<HapticCue, number>> = {
  idle: 140,
  edge: 95,
  "false-gate": 125,
  pickup: 120,
  latch: 160,
  tension: 180,
  seat: 220,
  boltwork: 260,
  fault: 420,
  unlock: 1200,
};

export class HapticFeedback {
  private enabled = true;
  private primed = false;
  private reducedMotion = false;
  private lastCueAt = new Map<HapticCue, number>();

  get isSupported() {
    return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
  }

  get isEnabled() {
    return this.enabled;
  }

  get isActive() {
    return this.isSupported && this.enabled && this.primed && !this.reducedMotion;
  }

  get label() {
    if (!this.isSupported) return "HAPTIC / N/A";
    if (this.reducedMotion) return "HAPTIC / MOTION OFF";
    return this.enabled ? "HAPTIC / ON" : "HAPTIC / OFF";
  }

  enableFromGesture() {
    this.primed = true;
  }

  setReducedMotion(enabled: boolean) {
    this.reducedMotion = enabled;
    if (enabled) this.cancel();
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.cancel();
    return this.enabled;
  }

  pulse(cue: HapticCue) {
    if (!this.isActive) return;
    const now = performance.now();
    const previous = this.lastCueAt.get(cue) ?? -Infinity;
    if (now - previous < MIN_INTERVAL_MS[cue]) return;
    this.lastCueAt.set(cue, now);
    try {
      navigator.vibrate(PATTERNS[cue]);
    } catch {
      // 権限や端末制約で失敗しても、音・操作・状態機械は継続する。
    }
  }

  cancel() {
    if (!this.isSupported) return;
    try {
      navigator.vibrate(0);
    } catch {
      // 非対応実装や権限制約は安全に無視する。
    }
  }

  dispose() {
    this.cancel();
    this.lastCueAt.clear();
  }
}
