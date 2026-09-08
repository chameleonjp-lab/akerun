/**
 * Vault Tumbler Lab — 端末内だけで保管する観察メモ。
 * 個人情報や外部送信を扱わず、プレイ中に採取した機構上の短い観察だけを保持する。
 */

export type ObservationCategory =
  | "false-gate"
  | "contact"
  | "boltwork"
  | "preload";

export type ObservationDirection = "cw" | "ccw";

/** プレイヤーが画面・音・触覚から観察できる反応だけを記録する。 */
export type ObservationSignal =
  | "rebound"
  | "edge"
  | "depth"
  | "load"
  | "release"
  | "idle";

export type ObservationDetails = {
  readonly problemId?: string | null;
  readonly problemVersion?: string | null;
  /** 画面上の輪番号。1始まりで保存する。 */
  readonly wheel?: number | null;
  /** ダイヤルの目盛り。0〜99で保存する。 */
  readonly dial?: number | null;
  readonly direction?: ObservationDirection | null;
  readonly pass?: number | null;
  readonly signal?: ObservationSignal | null;
};

export type ObservationNote = {
  readonly id: string;
  readonly vaultId: string;
  readonly category: ObservationCategory;
  readonly text: string;
  readonly createdAt: string;
  /** 旧形式のメモには null が入り、既存の観察を削除せずに表示できる。 */
  readonly problemId: string | null;
  readonly problemVersion: string | null;
  readonly wheel: number | null;
  readonly dial: number | null;
  readonly direction: ObservationDirection | null;
  readonly pass: number | null;
  readonly signal: ObservationSignal | null;
};

const STORAGE_KEY = "vault-tumbler-lab-observations";
const MAX_NOTES = 36;
const MAX_TEXT_LENGTH = 220;
const MAX_ID_LENGTH = 128;
const MAX_VAULT_ID_LENGTH = 128;
const MAX_PROBLEM_ID_LENGTH = 128;
const MAX_PROBLEM_VERSION_LENGTH = 32;
const OBSERVATION_CATEGORIES: readonly ObservationCategory[] = [
  "false-gate",
  "contact",
  "boltwork",
  "preload",
];
const OBSERVATION_DIRECTIONS: readonly ObservationDirection[] = ["cw", "ccw"];
const OBSERVATION_SIGNALS: readonly ObservationSignal[] = [
  "rebound",
  "edge",
  "depth",
  "load",
  "release",
  "idle",
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

const isObservationDirection = (
  value: unknown
): value is ObservationDirection =>
  typeof value === "string" &&
  OBSERVATION_DIRECTIONS.includes(value as ObservationDirection);

const isObservationSignal = (value: unknown): value is ObservationSignal =>
  typeof value === "string" &&
  OBSERVATION_SIGNALS.includes(value as ObservationSignal);

const isNullableStoredString = (value: unknown, maxLength: number) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength);

const isNullableStoredInteger = (
  value: unknown,
  minimum: number,
  maximum: number
) =>
  value === undefined ||
  value === null ||
  (typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum);

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
    isStoredDate(record.createdAt) &&
    isNullableStoredString(record.problemId, MAX_PROBLEM_ID_LENGTH) &&
    isNullableStoredString(record.problemVersion, MAX_PROBLEM_VERSION_LENGTH) &&
    isNullableStoredInteger(record.wheel, 1, 64) &&
    isNullableStoredInteger(record.dial, 0, 99) &&
    (record.direction === undefined ||
      record.direction === null ||
      isObservationDirection(record.direction)) &&
    isNullableStoredInteger(record.pass, 1, 999) &&
    (record.signal === undefined ||
      record.signal === null ||
      isObservationSignal(record.signal))
  );
};

const normalizedNullableString = (
  value: unknown,
  maxLength: number
): string | null =>
  typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;

const normalizedNullableInteger = (
  value: unknown,
  minimum: number,
  maximum: number
): number | null =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= minimum &&
  value <= maximum
    ? value
    : null;

const normalizedDetails = (details?: ObservationDetails) => ({
  problemId: normalizedNullableString(
    details?.problemId,
    MAX_PROBLEM_ID_LENGTH
  ),
  problemVersion: normalizedNullableString(
    details?.problemVersion,
    MAX_PROBLEM_VERSION_LENGTH
  ),
  wheel: normalizedNullableInteger(details?.wheel, 1, 64),
  dial: normalizedNullableInteger(details?.dial, 0, 99),
  direction: isObservationDirection(details?.direction)
    ? details.direction
    : null,
  pass: normalizedNullableInteger(details?.pass, 1, 999),
  signal: isObservationSignal(details?.signal) ? details.signal : null,
});

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
    text: string,
    details?: ObservationDetails
  ): ObservationNote {
    const normalizedVaultId =
      typeof vaultId === "string"
        ? vaultId.trim().slice(0, MAX_VAULT_ID_LENGTH)
        : "";
    const normalizedText =
      typeof text === "string"
        ? text.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT_LENGTH)
        : "";
    const metadata = normalizedDetails(details);
    const note: ObservationNote = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      vaultId: normalizedVaultId,
      category: isObservationCategory(category) ? category : "contact",
      text: normalizedText,
      createdAt: new Date().toISOString(),
      ...metadata,
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
          problemId: normalizedNullableString(
            record.problemId,
            MAX_PROBLEM_ID_LENGTH
          ),
          problemVersion: normalizedNullableString(
            record.problemVersion,
            MAX_PROBLEM_VERSION_LENGTH
          ),
          wheel: normalizedNullableInteger(record.wheel, 1, 64),
          dial: normalizedNullableInteger(record.dial, 0, 99),
          direction: isObservationDirection(record.direction)
            ? record.direction
            : null,
          pass: normalizedNullableInteger(record.pass, 1, 999),
          signal: isObservationSignal(record.signal) ? record.signal : null,
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
