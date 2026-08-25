import { describe, expect, it, vi } from "vitest";
import { InputController, containsInputRect, type InputRect } from "./InputController";

class TestCanvas extends EventTarget {
  captured = new Set<number>();

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }

  setPointerCapture(pointerId: number) {
    this.captured.add(pointerId);
  }

  hasPointerCapture(pointerId: number) {
    return this.captured.has(pointerId);
  }

  releasePointerCapture(pointerId: number) {
    this.captured.delete(pointerId);
  }
}

const pointerEvent = (type: string, pointerId: number, clientX: number, clientY: number) => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & Partial<PointerEvent>;
  Object.assign(event, { pointerId, clientX, clientY });
  return event;
};

const baseOptions = (canvas: TestCanvas, windowTarget: EventTarget, hitboxes: ReadonlyMap<string, InputRect>) => ({
  canvas,
  windowTarget,
  getSurfaceSize: () => ({ width: 100, height: 100 }),
  getDialLayout: () => ({ x: 50, y: 50, radius: 20 }),
  getHitboxes: () => hitboxes,
  isBlindMode: () => false,
  isInputEnabled: () => true,
  onGesture: vi.fn(),
  onAction: vi.fn(),
  onRotateDial: vi.fn(),
  onBeginPhysicalInput: vi.fn(() => "not-physical" as const),
  onUpdatePhysicalInput: vi.fn(),
  onEndPhysicalInput: vi.fn(),
  onKeyDown: vi.fn(),
  onKeyUp: vi.fn(),
});

describe("InputController", () => {
  it("routes hitboxes and dial gestures without exposing mechanism state", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = baseOptions(canvas, windowTarget, new Map([["pause", { x: 0, y: 0, width: 20, height: 20 }]]));
    new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 10, 10));
    expect(options.onAction).toHaveBeenCalledWith("pause");

    canvas.dispatchEvent(pointerEvent("pointerdown", 2, 70, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 2, 50, 70));
    expect(options.onRotateDial).toHaveBeenCalled();
  });

  it("does not route input while disabled", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = { ...baseOptions(canvas, windowTarget, new Map()), isInputEnabled: () => false };
    new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 50, 50));
    expect(options.onAction).not.toHaveBeenCalled();
    expect(options.onRotateDial).not.toHaveBeenCalled();
  });

  it("releases an active physical input on pointer end and dispose", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = { ...baseOptions(canvas, windowTarget, new Map([["tension-grip", { x: 0, y: 0, width: 20, height: 20 }]])), onBeginPhysicalInput: vi.fn(() => "tension" as const) };
    const controller = new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 3, 10, 10));
    canvas.dispatchEvent(pointerEvent("pointerup", 3, 10, 10));
    expect(options.onEndPhysicalInput).toHaveBeenCalledWith("tension");
    expect(canvas.captured.size).toBe(0);

    controller.dispose();
    windowTarget.dispatchEvent(new Event("keydown"));
    expect(options.onKeyDown).not.toHaveBeenCalled();
  });

  it("keeps rectangle hit testing deterministic", () => {
    expect(containsInputRect({ x: 10, y: 10, width: 20, height: 20 }, { x: 10, y: 10 })).toBe(true);
    expect(containsInputRect({ x: 10, y: 10, width: 20, height: 20 }, { x: 31, y: 10 })).toBe(false);
  });
});
