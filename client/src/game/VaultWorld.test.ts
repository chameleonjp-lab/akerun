import { describe, expect, it } from "vitest";
import { calculateScreenLayout } from "./VaultWorld";

const compactUnit = (width: number, height: number) =>
  Math.max(14, Math.min(width, height) / 52);

describe("calculateScreenLayout", () => {
  it.each([
    [320, 520],
    [390, 844],
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
  });

  it("retains a separate wide-screen mechanism column", () => {
    const layout = calculateScreenLayout(1363, 936, false);

    expect(layout.compact).toBe(false);
    expect(layout.dial.x).toBeCloseTo(1363 * 0.295, 5);
    expect(layout.internal.x).toBeCloseTo(1363 * 0.61, 5);
    expect(layout.footerY).toBeCloseTo(936 * 0.855, 5);
  });
});
