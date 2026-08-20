/**
 * Vault Tumbler Lab — 端末内だけで保管する観察メモ。
 * 個人情報や外部送信を扱わず、プレイ中に採取した機構上の短い観察だけを保持する。
 */

export type ObservationCategory = "false-gate" | "contact" | "boltwork" | "preload";

export type ObservationNote = {
  readonly id: string;
  readonly vaultId: string;
  readonly category: ObservationCategory;
  readonly text: string;
  readonly createdAt: string;
};

const STORAGE_KEY = "vault-tumbler-lab-observations";
const MAX_NOTES = 36;
const MAX_TEXT_LENGTH = 220;

export class ObservationLedger {
  private records: ObservationNote[] = [];

  constructor() {
    this.restore();
  }

  get recent(): readonly ObservationNote[] {
    return this.records.slice(0, 12);
  }

  get count(): number {
    return this.records.length;
  }

  add(vaultId: string, category: ObservationCategory, text: string): ObservationNote {
    const note: ObservationNote = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      vaultId,
      category,
      text: text.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT_LENGTH),
      createdAt: new Date().toISOString(),
    };
    if (!note.text) return note;
    this.records = [note, ...this.records].slice(0, MAX_NOTES);
    this.persist();
    return note;
  }

  remove(id: string) {
    const next = this.records.filter((record) => record.id !== id);
    if (next.length === this.records.length) return false;
    this.records = next;
    this.persist();
    return true;
  }

  private restore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) as ObservationNote[] : [];
      if (!Array.isArray(parsed)) return;
      this.records = parsed
        .filter((record) => record?.id && record.vaultId && record.category && record.text && record.createdAt)
        .slice(0, MAX_NOTES);
    } catch {
      // ストレージが使えない環境では、当該セッションだけでメモを扱う。
    }
  }

  private persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.records));
    } catch {
      // 保存失敗でゲーム体験は妨げない。
    }
  }
}
