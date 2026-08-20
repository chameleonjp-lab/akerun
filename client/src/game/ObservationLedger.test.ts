import { describe, expect, it, vi } from "vitest";
import { ObservationLedger } from "./ObservationLedger";

describe("ObservationLedger", () => {
  it("端末内で観察メモを保存し、上限を超えた古い記録を整理する", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) } });
    const ledger = new ObservationLedger();
    const note = ledger.add("museum-aurora", "false-gate", "浅い切欠きは短く反発し、座りには至らない。");
    expect(ledger.count).toBe(1);
    expect(ledger.recent[0]?.text).toContain("反発");
    expect(ledger.remove(note.id)).toBe(true);
    expect(ledger.count).toBe(0);
    vi.unstubAllGlobals();
  });
});
