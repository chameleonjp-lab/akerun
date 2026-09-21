import { describe, expect, it } from "vitest";
import {
  COMPACT_WORKBENCH_ONLY_MAX_HEIGHT,
  calculateScreenLayout,
  getContainedImageRect,
  formatObservationMetadata,
  getBlindPhysicalInputForPhase,
  getCutawayUnderlayAlpha,
  getPlayerDifficultyLabel,
  getPlayerPhaseLabel,
  getGuideTextForPhase,
  getDemoTurnCount,
  getWorkbenchMode,
  shouldAdvanceRunClock,
  shouldReleaseInputAfterPhaseChange,
} from "./VaultWorld";

const compactUnit = (width: number, height: number) =>
  Math.max(14, Math.min(width, height) / 52);

describe("calculateScreenLayout", () => {
  it("uses the compact workbench-only mode before the mobile menu can overlap it", () => {
    expect(COMPACT_WORKBENCH_ONLY_MAX_HEIGHT).toBe(550);
    const layout = calculateScreenLayout(320, 520, false);
    const unit = compactUnit(320, 520);
    const workbenchBottom =
      layout.footerY + Math.min(unit * 9, layout.height * 0.11);
    const mobileMenuTop = 520 - 10 - (44 * 2 + 6);

    expect(workbenchBottom).toBeLessThanOrEqual(mobileMenuTop);
    expect(layout.compactMechanism).toBeNull();
  });

  it("falls back to a finite layout when the surface reports invalid dimensions", () => {
    const layout = calculateScreenLayout(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      false
    );

    expect(layout.width).toBe(1);
    expect(layout.height).toBe(1);
    expect(Object.values(layout.dial).every(Number.isFinite)).toBe(true);
  });

  it.each([
    [320, 520],
    [390, 844],
    [402, 874],
    [430, 932],
  ])(
    "keeps the portrait dial and workbench in separate bands at %ix%i",
    (width, height) => {
      const layout = calculateScreenLayout(width, height, false);
      const unit = compactUnit(width, height);
      const controlsBottom =
        layout.dial.y + layout.dial.radius * 1.42 + unit * 2.35;
      const messageBottom = layout.footerY + unit * 4.2;
      const workbenchTop = layout.footerY + unit * 4.85;
      const workbenchBottom = workbenchTop + Math.min(unit * 9, height * 0.11);

      expect(layout.compact).toBe(true);
      if (height >= 700) {
        expect(layout.compactMechanism).not.toBeNull();
        expect(layout.compactMechanism!.y).toBeGreaterThanOrEqual(
          unit * 10 - 0.001
        );
        expect(
          layout.compactMechanism!.y + layout.compactMechanism!.height
        ).toBeLessThanOrEqual(
          layout.dial.y - layout.dial.radius * 1.12 - unit * 0.12 + 0.001
        );
      } else {
        expect(layout.compactMechanism).toBeNull();
      }
      expect(layout.footerY).toBeGreaterThanOrEqual(
        controlsBottom + unit * 0.7 - 0.001
      );
      expect(workbenchTop).toBeGreaterThan(messageBottom);
      expect(workbenchBottom).toBeLessThanOrEqual(height + 0.001);
      expect(layout.dial.y - layout.dial.radius * 1.12).toBeGreaterThanOrEqual(
        unit * 8 - 0.001
      );
    }
  );

  it.each([
    [320, 245, true],
    [320, 257, false],
    [320, 320, false],
    [320, 328, false],
    [390, 562, false],
    [402, 592, false],
    [390, 621, true],
  ])(
    "keeps every compact control inside a constrained mobile canvas at %ix%i (%s)",
    (width, height, training) => {
      const layout = calculateScreenLayout(width, height, training);
      const unit = compactUnit(width, height);
      const controlsBottom =
        layout.dial.y + layout.dial.radius * 1.42 + unit * 2.35;
      const workbenchHeight = training
        ? Math.min(unit * 10, height * 0.115)
        : Math.min(unit * 9, height * 0.11);
      const workbenchBottom =
        layout.footerY +
        (training || height <= COMPACT_WORKBENCH_ONLY_MAX_HEIGHT
          ? workbenchHeight
          : unit * 4.85 + workbenchHeight);

      expect(layout.compact).toBe(true);
      expect(layout.dial.y - layout.dial.radius * 1.12).toBeGreaterThanOrEqual(
        0
      );
      expect(layout.footerY).toBeGreaterThanOrEqual(
        controlsBottom + unit * 0.7 - 0.001
      );
      expect(workbenchBottom).toBeLessThanOrEqual(height + 0.001);
    }
  );

  it("keeps the compact training workbench below the dial controls", () => {
    const layout = calculateScreenLayout(390, 844, true);
    const unit = compactUnit(390, 844);
    const controlsBottom =
      layout.dial.y + layout.dial.radius * 1.42 + unit * 2.35;

    expect(layout.footerY).toBeGreaterThanOrEqual(
      controlsBottom + unit * 0.7 - 0.001
    );
    expect(
      layout.footerY + Math.min(unit * 10, 844 * 0.115)
    ).toBeLessThanOrEqual(844);
    expect(layout.compactMechanism).not.toBeNull();
  });

  it("retains a separate wide-screen mechanism column", () => {
    const layout = calculateScreenLayout(1363, 936, false);

    expect(layout.compact).toBe(false);
    expect(layout.dial.x).toBeCloseTo(1363 * 0.295, 5);
    expect(layout.internal.x).toBeCloseTo(1363 * 0.61, 5);
    expect(layout.compactMechanism).toBeNull();
    expect(layout.footerY).toBeCloseTo(936 * 0.855, 5);
  });

  it("keeps a narrow landscape surface on the wide layout", () => {
    const layout = calculateScreenLayout(568, 320, false);

    expect(layout.compact).toBe(false);
    expect(layout.dial.x).toBeCloseTo(568 * 0.295, 5);
    expect(layout.compactMechanism).toBeNull();
  });

  it("fits the dial, mechanism and workbench inside an actual short landscape surface", () => {
    const layout = calculateScreenLayout(874, 402, false);
    const unit = Math.max(10, Math.min(874, 402) / 85);
    const controlsBottom =
      layout.dial.y + layout.dial.radius * 1.42 + unit * 2.35;
    const benchBottom = layout.footerY + unit * 0.4 + unit * 6.0;

    expect(layout.shortViewport).toBe(true);
    expect(layout.compact).toBe(false);
    expect(controlsBottom).toBeLessThanOrEqual(layout.footerY);
    expect(benchBottom).toBeLessThanOrEqual(layout.height);
  });
});

describe("player-facing labels", () => {
  it("formats observation metadata without internal field codes", () => {
    expect(
      formatObservationMetadata({
        id: "note-1",
        vaultId: "reliquary-nocturne",
        category: "false-gate",
        text: "浅い接触",
        createdAt: "2026-09-21T00:00:00.000Z",
        problemId: "AKERUN-02-V1",
        problemVersion: "V1",
        wheel: 2,
        dial: 7,
        direction: "ccw",
        pass: 3,
        signal: "edge",
      })
    ).toBe("問題 02 · 第2輪 07 · 左 · 3回 · ゲート縁");
  });

  it("uses Japanese labels for mode and mechanism phase", () => {
    expect(getPlayerDifficultyLabel("standard")).toBe("標準");
    expect(getPlayerDifficultyLabel("blind")).toBe("音だけ");
    expect(getPlayerPhaseLabel("tension-test")).toBe("テンション確認");
    expect(getPlayerPhaseLabel("unexpected-phase")).toBe("操作中");
  });
});

describe("shouldReleaseInputAfterPhaseChange", () => {
  it("releases the previous gesture when a successful phase changes the part", () => {
    expect(
      shouldReleaseInputAfterPhaseChange("tension-test", "fence-ready")
    ).toBe(true);
    expect(
      shouldReleaseInputAfterPhaseChange("bolt-test", "boltwork-ready")
    ).toBe(true);
    expect(shouldReleaseInputAfterPhaseChange("handle-test", "open")).toBe(
      true
    );
  });

  it("keeps jam recovery under the player's release control", () => {
    expect(shouldReleaseInputAfterPhaseChange("fence-ready", "jammed")).toBe(
      false
    );
    expect(shouldReleaseInputAfterPhaseChange("fence-ready", "lockout")).toBe(
      true
    );
    expect(shouldReleaseInputAfterPhaseChange("dial", "dial")).toBe(false);
  });
});

describe("shouldAdvanceRunClock", () => {
  it("stops the run clock while safety lockout waits for RESET", () => {
    expect(shouldAdvanceRunClock(true, false, "tension-test")).toBe(true);
    expect(shouldAdvanceRunClock(true, false, "lockout")).toBe(false);
    expect(shouldAdvanceRunClock(false, false, "dial")).toBe(false);
    expect(shouldAdvanceRunClock(true, true, "open")).toBe(false);
  });
});

describe("getContainedImageRect", () => {
  it("preserves a landscape cutaway aspect ratio inside a panel", () => {
    expect(
      getContainedImageRect(1200, 600, {
        x: 10,
        y: 20,
        width: 300,
        height: 300,
      })
    ).toEqual({
      x: 10,
      y: 95,
      width: 300,
      height: 150,
    });
  });

  it("returns no draw area for invalid image dimensions or excessive padding", () => {
    expect(
      getContainedImageRect(0, 600, { x: 10, y: 20, width: 300, height: 300 })
    ).toBeNull();
    expect(
      getContainedImageRect(
        1200,
        600,
        { x: 10, y: 20, width: 20, height: 20 },
        11
      )
    ).toBeNull();
  });
});

describe("getCutawayUnderlayAlpha", () => {
  it("does not show a fixed six-wheel photo behind variable wheel counts", () => {
    expect(getCutawayUnderlayAlpha(4)).toBe(0);
    expect(getCutawayUnderlayAlpha(5)).toBe(0);
    expect(getCutawayUnderlayAlpha(6)).toBe(0.2);
    expect(getCutawayUnderlayAlpha(2)).toBe(0);
  });
});

describe("getWorkbenchMode", () => {
  it("maps overload phases to distinct workbench controls", () => {
    expect(getWorkbenchMode("jammed")).toBe("recovery");
    expect(getWorkbenchMode("lockout")).toBe("lockout");
    expect(getWorkbenchMode("tension-test")).toBe("tension");
    expect(getWorkbenchMode("fence-ready")).toBe("fence");
    expect(getWorkbenchMode("bolt-test")).toBe("bolt");
    expect(getWorkbenchMode("handle-test")).toBe("handle");
  });
});

describe("getBlindPhysicalInputForPhase", () => {
  it("keeps blind dial input horizontal until the post-dial phase", () => {
    expect(getBlindPhysicalInputForPhase("dial")).toBeNull();
    expect(getBlindPhysicalInputForPhase("settling")).toBeNull();
    expect(getBlindPhysicalInputForPhase("tension-ready")).toBe("tension");
    expect(getBlindPhysicalInputForPhase("fence-ready")).toBe("fence");
    expect(getBlindPhysicalInputForPhase("fence-seated")).toBe("bolt");
    expect(getBlindPhysicalInputForPhase("handle-test")).toBe("handle");
    expect(getBlindPhysicalInputForPhase("jammed")).toBe("tension");
  });
});

describe("getGuideTextForPhase", () => {
  it("keeps the HUD action guide valid through the final actuator stages", () => {
    expect(getGuideTextForPhase("tension-test")).toBe("抵抗帯の中で保持");
    expect(getGuideTextForPhase("fence-ready")).toBe("ゆっくりフェンスを着座");
    expect(getGuideTextForPhase("bolt-test")).toBe("ボルトの退避量を確認");
    expect(getGuideTextForPhase("boltwork-ready")).toBe(
      "扉ハンドルでボルトワークを後退"
    );
    expect(getGuideTextForPhase("handle-test")).toBe(
      "扉ハンドルでボルトワークを後退"
    );
    expect(getGuideTextForPhase("jammed")).toBe("力を抜いて状態を見直す");
    expect(getGuideTextForPhase("lockout")).toBe("安全停止。RESETを押す");
    expect(getGuideTextForPhase("open")).toBeNull();
  });
});

describe("getDemoTurnCount", () => {
  it("consumes elapsed time without losing sub-frame dial intervals", () => {
    expect(getDemoTurnCount(0.016)).toBe(0);
    expect(getDemoTurnCount(0.048)).toBe(1);
    expect(getDemoTurnCount(0.288)).toBe(6);
    expect(getDemoTurnCount(0.9)).toBe(12);
    expect(getDemoTurnCount(Number.NaN)).toBe(0);
  });
});
