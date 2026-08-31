/**
 * Vault Tumbler Lab — 端末内だけで保管する観察メモ。
 * 個人情報や外部送信を扱わず、プレイ中に採取した機構上の短い観察だけを保持する。
 */

export type ObservationCategory =
  | "false-gate"
  | "contact"
  | "boltwork"
  | "preload";

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
const MAX_ID_LENGTH = 128;
const MAX_VAULT_ID_LENGTH = 128;
const OBSERVATION_CATEGORIES: readonly ObservationCategory[] = [
  "false-gate",
  "contact",
  "boltwork",
  "preload",
];

const isStoredDate = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= 64 &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString() === value;

const isObservationCategory = (value: unknown): value is ObservationCategory =>
  typeof value === "string" &&
  OBSERVATION_CATEGORIES.includes(value as ObservationCategory);

const isStoredNote = (value: unknown): value is ObservationNote => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    record.id.trim().length > 0 &&
    record.id.length <= MAX_ID_LENGTH &&
    typeof record.vaultId === "string" &&
    record.vaultId.trim().length > 0 &&
    record.vaultId.length <= MAX_VAULT_ID_LENGTH &&
    isObservationCategory(record.category) &&
    typeof record.text === "string" &&
    record.text.trim().length > 0 &&
    record.text.length <= MAX_TEXT_LENGTH &&
    isStoredDate(record.createdAt)
  );
};

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

  add(
    vaultId: string,
    category: ObservationCategory,
    text: string
  ): ObservationNote {
    const normalizedVaultId =
      typeof vaultId === "string"
        ? vaultId.trim().slice(0, MAX_VAULT_ID_LENGTH)
        : "";
    const normalizedText =
      typeof text === "string"
        ? text.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT_LENGTH)
        : "";
    const note: ObservationNote = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      vaultId: normalizedVaultId,
      category: isObservationCategory(category) ? category : "contact",
      text: normalizedText,
      createdAt: new Date().toISOString(),
    };
    if (!note.vaultId || !note.text) return note;
    this.records = [note, ...this.records].slice(0, MAX_NOTES);
    this.persist();
    return note;
  }

  remove(id: string) {
    const next = this.records.filter(record => record.id !== id);
    if (next.length === this.records.length) return false;
    this.records = next;
    this.persist();
    return true;
  }

  private restore() {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as ObservationNote[]) : [];
      if (!Array.isArray(parsed)) return;
      this.records = parsed
        .filter(isStoredNote)
        .map(record => ({
          id: record.id.trim().slice(0, MAX_ID_LENGTH),
          vaultId: record.vaultId.trim().slice(0, MAX_VAULT_ID_LENGTH),
          category: record.category,
          text: record.text
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, MAX_TEXT_LENGTH),
          createdAt: record.createdAt,
        }))
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
