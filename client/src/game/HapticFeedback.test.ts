import { afterEach, describe, expect, it, vi } from "vitest";
import { HapticFeedback } from "./HapticFeedback";

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

const restoreNavigator = () => {
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
};

afterEach(() => restoreNavigator());

describe("HapticFeedback", () => {
  it("対応端末ではユーザー操作後に手掛かりごとの振動を送り、低モーション時は停止する", () => {
    const vibrate = vi.fn();
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { vibrate } });
    const haptics = new HapticFeedback();
    expect(haptics.isSupported).toBe(true);
    expect(haptics.isActive).toBe(false);

    haptics.enableFromGesture();
    haptics.pulse("edge");
    expect(vibrate).toHaveBeenCalledWith([10, 32, 10]);

    haptics.setReducedMotion(true);
    expect(vibrate).toHaveBeenLastCalledWith(0);
    haptics.pulse("unlock");
    expect(vibrate).toHaveBeenCalledTimes(2);
  });

  it("非対応環境では例外を出さずに無操作で終える", () => {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: undefined });
    const haptics = new HapticFeedback();
    expect(haptics.isSupported).toBe(false);
    expect(() => {
      haptics.enableFromGesture();
      haptics.pulse("fault");
      haptics.cancel();
    }).not.toThrow();
  });
});
