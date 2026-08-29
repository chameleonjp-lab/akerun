import { describe, expect, it } from "vitest";
import {
  expandHitbox,
  getCanvasPixelRatio,
  getCanvasResolution,
  getLogicalCanvasSize,
} from "./CanvasSurface";

describe("CanvasSurface", () => {
  it("keeps logical coordinates independent from device pixel ratio", () => {
    const standard = getCanvasResolution(390, 844, 1);
    const retina = getCanvasResolution(390, 844, 2);
    const capped = getCanvasResolution(390, 844, 3);

    expect(retina.width).toBe(standard.width);
    expect(retina.height).toBe(standard.height);
    expect(retina.pixelWidth).toBe(standard.width * 2);
    expect(retina.pixelHeight).toBe(standard.height * 2);
    expect(capped.pixelRatio).toBe(2);
    expect(capped.pixelWidth).toBe(retina.pixelWidth);
  });

  it("normalizes invalid and small surfaces to the playable minimum", () => {
    expect(getLogicalCanvasSize(0, Number.NaN)).toEqual({ width: 320, height: 520 });
    expect(getCanvasPixelRatio(undefined)).toBe(1);
    expect(getCanvasPixelRatio(0.5)).toBe(1);
  });

  it("expands small controls without moving their visual center", () => {
    expect(expandHitbox({ x: 100, y: 100, width: 20, height: 30 })).toEqual({
      x: 88,
      y: 93,
      width: 44,
      height: 44,
    });
  });
});
