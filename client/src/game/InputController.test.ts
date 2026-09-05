import { describe, expect, it, vi } from "vitest";
import {
  InputController,
  containsInputRect,
  type InputRect,
} from "./InputController";

class TestCanvas extends EventTarget {
  captured = new Set<number>();
  throwOnCapture = false;
  invalidBounds = false;

  getBoundingClientRect() {
    if (this.invalidBounds) {
      return {
        left: Number.NaN,
        top: Number.NaN,
        width: Number.NaN,
        height: Number.NaN,
      };
    }
    return { left: 0, top: 0, width: 100, height: 100 };
  }

  setPointerCapture(pointerId: number) {
    if (this.throwOnCapture) throw new Error("pointer capture unavailable");
    this.captured.add(pointerId);
  }

  hasPointerCapture(pointerId: number) {
    return this.captured.has(pointerId);
  }

  releasePointerCapture(pointerId: number) {
    this.captured.delete(pointerId);
  }
}

const pointerEvent = (
  type: string,
  pointerId: number,
  clientX: number,
  clientY: number
) => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event &
    Partial<PointerEvent>;
  Object.assign(event, { pointerId, clientX, clientY });
  return event;
};

const baseOptions = (
  canvas: TestCanvas,
  windowTarget: EventTarget,
  hitboxes: ReadonlyMap<string, InputRect>
) => ({
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
    const options = baseOptions(
      canvas,
      windowTarget,
      new Map([["pause", { x: 0, y: 0, width: 20, height: 20 }]])
    );
    new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 10, 10));
    expect(options.onAction).toHaveBeenCalledWith("pause");

    canvas.dispatchEvent(pointerEvent("pointerdown", 2, 70, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 2, 50, 70));
    expect(options.onRotateDial).toHaveBeenCalled();
  });

  it("accepts both rotation directions and a drag that starts at the hub", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = baseOptions(canvas, windowTarget, new Map());
    new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 50, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, 70, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, 50, 70));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, 70, 50));

    const rotations = options.onRotateDial.mock.calls.map(
      ([steps]) => steps as number
    );
    expect(rotations.some(steps => steps > 0)).toBe(true);
    expect(rotations.some(steps => steps < 0)).toBe(true);
  });

  it("ignores a second pointer while a dial gesture is active", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = baseOptions(canvas, windowTarget, new Map());

    new InputController(options);
    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 70, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 2, 50, 70));
    expect(options.onRotateDial).not.toHaveBeenCalled();

    canvas.dispatchEvent(pointerEvent("pointermove", 1, 50, 70));
    expect(options.onRotateDial).toHaveBeenCalled();
  });

  it("uses the first move from the center as the dial angle baseline", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = {
      ...baseOptions(canvas, windowTarget, new Map()),
      getDialLayout: () => ({ x: 50, y: 50, radius: 20, deadZoneRadius: 10 }),
    };
    new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 50, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 1, 60, 50));
    expect(options.onRotateDial).not.toHaveBeenCalled();

    canvas.dispatchEvent(pointerEvent("pointermove", 1, 50, 60));

    expect(options.onRotateDial).toHaveBeenCalled();
  });

  it("continues an active gesture when pointer capture is unavailable", () => {
    const canvas = new TestCanvas();
    canvas.throwOnCapture = true;
    const windowTarget = new EventTarget();
    const options = baseOptions(
      canvas,
      windowTarget,
      new Map([["tension-grip", { x: 0, y: 0, width: 20, height: 20 }]])
    );
    const controller = new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 70, 50));
    windowTarget.dispatchEvent(pointerEvent("pointermove", 1, 50, 70));
    expect(options.onRotateDial).toHaveBeenCalled();

    controller.dispose();
  });

  it("continues an active physical input when pointer capture is unavailable", () => {
    const canvas = new TestCanvas();
    canvas.throwOnCapture = true;
    const windowTarget = new EventTarget();
    const options = {
      ...baseOptions(
        canvas,
        windowTarget,
        new Map([["tension-grip", { x: 0, y: 0, width: 20, height: 20 }]])
      ),
      onBeginPhysicalInput: vi.fn(() => "tension" as const),
    };
    const controller = new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 2, 10, 10));
    windowTarget.dispatchEvent(pointerEvent("pointermove", 2, 18, 10));
    expect(options.onUpdatePhysicalInput).toHaveBeenCalledWith(
      "tension",
      { x: 10, y: 10 },
      { x: 18, y: 10 }
    );

    windowTarget.dispatchEvent(pointerEvent("pointerup", 2, 18, 10));
    expect(options.onEndPhysicalInput).toHaveBeenCalledWith("tension");
    controller.dispose();
  });

  it("does not route input while disabled", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = {
      ...baseOptions(canvas, windowTarget, new Map()),
      isInputEnabled: () => false,
    };
    new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 1, 50, 50));
    expect(options.onAction).not.toHaveBeenCalled();
    expect(options.onRotateDial).not.toHaveBeenCalled();
  });

  it("routes blind post-dial touch drags to the active physical input", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = {
      ...baseOptions(canvas, windowTarget, new Map()),
      isBlindMode: () => true,
      getBlindPhysicalInput: () => "fence" as const,
    };
    const controller = new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 4, 50, 70));
    canvas.dispatchEvent(pointerEvent("pointermove", 4, 50, 50));
    expect(options.onUpdatePhysicalInput).toHaveBeenCalledWith(
      "fence",
      { x: 50, y: 70 },
      { x: 50, y: 50 }
    );
    expect(options.onRotateDial).not.toHaveBeenCalled();

    canvas.dispatchEvent(pointerEvent("pointerup", 4, 50, 50));
    expect(options.onEndPhysicalInput).toHaveBeenCalledWith("fence");
    controller.dispose();
  });

  it("retains blind horizontal dial input during the dial phase", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = {
      ...baseOptions(canvas, windowTarget, new Map()),
      isBlindMode: () => true,
      getBlindPhysicalInput: () => null,
    };
    const controller = new InputController(options);

    canvas.dispatchEvent(pointerEvent("pointerdown", 5, 50, 50));
    canvas.dispatchEvent(pointerEvent("pointermove", 5, 64, 50));
    expect(options.onRotateDial).toHaveBeenCalledWith(2);
    expect(options.onUpdatePhysicalInput).not.toHaveBeenCalled();
    controller.dispose();
  });

  it("releases an active physical input on pointer end and dispose", () => {
    const canvas = new TestCanvas();
    const windowTarget = new EventTarget();
    const options = {
      ...baseOptions(
        canvas,
        windowTarget,
        new Map([["tension-grip", { x: 0, y: 0, width: 20, height: 20 }]])
      ),
      onBeginPhysicalInput: vi.fn(() => "tension" as const),
    };
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
    expect(
      containsInputRect(
        { x: 10, y: 10, width: 20, height: 20 },
        { x: 10, y: 10 }
      )
    ).toBe(true);
    expect(
      containsInputRect(
        { x: 10, y: 10, width: 20, height: 20 },
        { x: 31, y: 10 }
      )
    ).toBe(false);
  });

  it("keeps invalid browser geometry from turning a pointer into NaN coordinates", () => {
    const canvas = new TestCanvas();
    canvas.invalidBounds = true;
    const windowTarget = new EventTarget();
    const options = baseOptions(
      canvas,
      windowTarget,
      new Map([["pause", { x: 0, y: 0, width: 20, height: 20 }]])
    );
    new InputController(options);

    canvas.dispatchEvent(
      pointerEvent("pointerdown", 1, Number.NaN, Number.NaN)
    );

    expect(options.onAction).toHaveBeenCalledWith("pause");
  });
});
