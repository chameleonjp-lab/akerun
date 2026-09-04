import { describe, expect, it } from "vitest";
import {
  COMPACT_WORKBENCH_ONLY_MAX_HEIGHT,
  calculateScreenLayout,
  getContainedImageRect,
  getCutawayUnderlayAlpha,
  getDemoTurnCount,
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

describe("getDemoTurnCount", () => {
  it("consumes elapsed time without losing sub-frame dial intervals", () => {
    expect(getDemoTurnCount(0.016)).toBe(0);
    expect(getDemoTurnCount(0.048)).toBe(1);
    expect(getDemoTurnCount(0.288)).toBe(6);
    expect(getDemoTurnCount(0.9)).toBe(12);
    expect(getDemoTurnCount(Number.NaN)).toBe(0);
  });
});
