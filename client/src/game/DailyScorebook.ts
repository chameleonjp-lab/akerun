/**
 * Vault Tumbler Lab — 日替わり契約の端末内自己ベスト。
 * サーバー送信や個人識別を行わず、契約seed・時間・失敗数だけを保存する。
 */
export type DailyBest = {
  readonly seed: number;
  readonly elapsed: number;
  readonly faults: number;
  readonly achievedAt: string;
};

const STORAGE_KEY = "vault-tumbler-lab-daily-bests";

export class DailyScorebook {
  private readonly records = new Map<number, DailyBest>();

  constructor() {
    this.restore();
  }

  record(seed: number, elapsed: number, faults: number) {
    const candidate: DailyBest = { seed, elapsed, faults, achievedAt: new Date().toISOString() };
    const previous = this.records.get(seed);
    const improved = !previous || elapsed < previous.elapsed || (elapsed === previous.elapsed && faults < previous.faults);
    if (improved) {
      this.records.set(seed, candidate);
      this.persist();
    }
    return { best: this.records.get(seed) ?? candidate, improved };
  }

  get(seed: number) {
    return this.records.get(seed) ?? null;
  }

  get recent() {
    return Array.from(this.records.values()).sort((left, right) => right.seed - left.seed).slice(0, 5);
  }

  private restore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as DailyBest[] : [];
      if (!Array.isArray(parsed)) return;
      parsed.forEach((record) => {
        if (Number.isFinite(record?.seed) && Number.isFinite(record.elapsed) && Number.isFinite(record.faults)) this.records.set(record.seed, record);
      });
    } catch {
      // 保存が使えない環境では当該セッションのみで結果を扱う。
    }
  }

  private persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(this.records.values())));
    } catch {
      // 保存失敗でゲーム体験は妨げない。
    }
  }
}
