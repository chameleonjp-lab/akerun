/**
 * Canvas入力のライフサイクルとポインター状態を担当する。
 * 金庫ルールや音・演出へはコールバックで通知し、入力層から機構を直接操作しない。
 */
export type InputPoint = { readonly x: number; readonly y: number };

export type InputRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type InputSurfaceSize = { readonly width: number; readonly height: number };

export type InputDialLayout = {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** 中心から始めた場合、最初の移動を角度の基準作りに使う範囲。 */
  readonly deadZoneRadius?: number;
};

export type PhysicalInput = "tension" | "fence" | "bolt" | "handle";
export type PhysicalInputStartResult = "not-physical" | "blocked" | PhysicalInput;

export type InputCanvas = EventTarget & {
  getBoundingClientRect: () => { left: number; top: number; width: number; height: number };
  setPointerCapture?: (pointerId: number) => void;
  hasPointerCapture?: (pointerId: number) => boolean;
  releasePointerCapture?: (pointerId: number) => void;
};

export type InputControllerOptions = {
  readonly canvas: InputCanvas;
  readonly windowTarget: EventTarget;
  readonly getSurfaceSize: () => InputSurfaceSize;
  readonly getDialLayout: () => InputDialLayout;
  readonly getHitboxes: () => ReadonlyMap<string, InputRect>;
  readonly isBlindMode: () => boolean;
  readonly isInputEnabled: () => boolean;
  readonly onGesture: () => void;
  readonly onAction: (action: string) => void;
  readonly onRotateDial: (steps: number) => void;
  readonly onBeginPhysicalInput: (action: string) => PhysicalInputStartResult;
  readonly onUpdatePhysicalInput: (input: PhysicalInput, start: InputPoint, point: InputPoint) => void;
  readonly onEndPhysicalInput: (input: PhysicalInput) => void;
  readonly onKeyDown: (event: KeyboardEvent) => void;
  readonly onKeyUp: (event: KeyboardEvent) => void;
};

const contains = (rect: InputRect, point: InputPoint) =>
  point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;

export class InputController {
  private readonly listeners: Array<() => void> = [];
  private lastPointerAngle: number | null = null;
  private dialNeedsAngle = false;
  private blindPointerX: number | null = null;
  private pointerCarry = 0;
  private activePointerId: number | null = null;
  private activePhysicalInput: PhysicalInput | null = null;
  private physicalPointerStart: InputPoint | null = null;

  constructor(private readonly options: InputControllerOptions) {
    this.bind();
  }

  release() {
    this.endPointer();
  }

  dispose() {
    this.release();
    this.listeners.forEach((remove) => remove());
    this.listeners.length = 0;
  }

  private bind() {
    const onPointerDown = (event: PointerEvent) => {
      if (!this.options.isInputEnabled()) return;
      // 一本の指だけを操作として採用し、二本目の指で状態を乗っ取らせない。
      if (event.isPrimary === false || this.activePointerId !== null) return;
      this.options.onGesture();
      const point = this.mapPointer(event);
      if (this.options.isBlindMode()) {
        this.blindPointerX = point.x;
        this.activePointerId = event.pointerId;
        this.capturePointer(event.pointerId);
        return;
      }

      const layout = this.options.getDialLayout();
      const dx = point.x - layout.x;
      const dy = point.y - layout.y;
      for (const [action, rect] of Array.from(this.options.getHitboxes().entries())) {
        if (!contains(rect, point)) continue;
        const physicalInput = this.options.onBeginPhysicalInput(action);
        if (physicalInput !== "not-physical") {
          if (physicalInput !== "blocked") {
            this.activePhysicalInput = physicalInput;
            this.physicalPointerStart = point;
            this.activePointerId = event.pointerId;
            this.capturePointer(event.pointerId);
          }
          return;
        }
        this.options.onAction(action);
        return;
      }

      const distanceFromCenter = Math.hypot(dx, dy);
      const deadZoneRadius = Math.max(
        0,
        Math.min(layout.radius * 0.86, layout.deadZoneRadius ?? 0),
      );
      if (distanceFromCenter <= layout.radius * 1.08) {
        this.dialNeedsAngle = distanceFromCenter < deadZoneRadius;
        this.lastPointerAngle = this.dialNeedsAngle ? null : Math.atan2(dy, dx);
        this.pointerCarry = 0;
        this.activePointerId = event.pointerId;
        this.capturePointer(event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!this.options.isInputEnabled()) return;
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
      const point = this.mapPointer(event);
      if (this.options.isBlindMode() && this.blindPointerX !== null) {
        const requestedSteps = Math.trunc((point.x - this.blindPointerX) / 7);
        const steps = Math.max(-8, Math.min(8, requestedSteps));
        if (steps !== 0) {
          this.options.onRotateDial(steps);
          this.blindPointerX += steps * 7;
        }
        return;
      }
      if (this.activePhysicalInput && this.physicalPointerStart) {
        this.options.onUpdatePhysicalInput(this.activePhysicalInput, this.physicalPointerStart, point);
        return;
      }
      const layout = this.options.getDialLayout();
      const nextAngle = Math.atan2(point.y - layout.y, point.x - layout.x);
      // ハブの真上から始めたドラッグには初回の移動方向が存在しない。
      // 最初の移動を基準角の確定に使えば、中心からでも自然に回し始められる。
      if (this.lastPointerAngle === null) {
        if (!this.dialNeedsAngle) return;
        this.lastPointerAngle = nextAngle;
        this.dialNeedsAngle = false;
        return;
      }
      let delta = nextAngle - this.lastPointerAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      this.pointerCarry += (delta / (Math.PI * 2)) * 100;
      const requestedSteps = this.pointerCarry > 0 ? Math.floor(this.pointerCarry) : Math.ceil(this.pointerCarry);
      const steps = Math.max(-8, Math.min(8, requestedSteps));
      if (steps !== 0) {
        this.options.onRotateDial(steps);
        this.pointerCarry -= steps;
      }
      // 大きな座標ジャンプでも、1つの入力通知で機構を急加速させない。
      this.pointerCarry = Math.max(-8, Math.min(8, this.pointerCarry));
      this.lastPointerAngle = nextAngle;
    };

    const endPointer = (event?: PointerEvent) => {
      if (event && this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
      this.endPointer();
    };

    const onWheel = (event: WheelEvent) => {
      if (!this.options.isInputEnabled()) return;
      event.preventDefault();
      this.options.onGesture();
      const magnitude = Math.min(8, Math.max(1, Math.round(Math.abs(event.deltaY) / 42)));
      this.options.onRotateDial(event.deltaY > 0 ? magnitude : -magnitude);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!this.options.isInputEnabled()) return;
      this.options.onKeyDown(event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      this.options.onKeyUp(event);
    };

    this.addListener(this.options.canvas, "pointerdown", onPointerDown as EventListener);
    this.addListener(this.options.canvas, "pointermove", onPointerMove as EventListener);
    this.addListener(this.options.canvas, "pointerup", endPointer as EventListener);
    this.addListener(this.options.canvas, "pointercancel", endPointer as EventListener);
    // setPointerCapture はブラウザ・WebViewによって利用できないことがある。
    // 捕捉の喪失は必ずしも指の終了ではないため、pointerup/cancelだけを終了条件にする。
    this.addListener(this.options.windowTarget, "pointerup", endPointer as EventListener);
    this.addListener(this.options.windowTarget, "pointercancel", endPointer as EventListener);
    this.addListener(this.options.windowTarget, "pointermove", ((event: Event) => {
      // Canvasからのバブリングで同じ移動を二重処理しない。
      if (event.target === this.options.canvas) return;
      onPointerMove(event as PointerEvent);
    }) as EventListener);
    this.addListener(this.options.canvas, "wheel", onWheel as EventListener, { passive: false });
    this.addListener(this.options.windowTarget, "keydown", onKeyDown as EventListener);
    this.addListener(this.options.windowTarget, "keyup", onKeyUp as EventListener);
  }

  private endPointer() {
    const physicalInput = this.activePhysicalInput;
    const pointerId = this.activePointerId;
    this.activePointerId = null;
    this.activePhysicalInput = null;
    this.physicalPointerStart = null;
    this.lastPointerAngle = null;
    this.dialNeedsAngle = false;
    this.blindPointerX = null;
    this.pointerCarry = 0;
    if (physicalInput) this.options.onEndPhysicalInput(physicalInput);
    if (pointerId !== null) this.releasePointer(pointerId);
  }

  private mapPointer(event: PointerEvent): InputPoint {
    const bounds = this.options.canvas.getBoundingClientRect();
    const size = this.options.getSurfaceSize();
    return {
      x: ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * size.width,
      y: ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * size.height,
    };
  }

  private capturePointer(pointerId: number) {
    try {
      this.options.canvas.setPointerCapture?.(pointerId);
    } catch {
      // 捕捉できなくても、Canvas内の移動とwindowの終了通知で操作を継続できる。
    }
  }

  private releasePointer(pointerId: number) {
    try {
      if (this.options.canvas.hasPointerCapture?.(pointerId)) this.options.canvas.releasePointerCapture?.(pointerId);
    } catch {
      // ブラウザ側ですでに捕捉が解除されている場合は何もしない。
    }
  }

  private addListener(target: EventTarget, type: string, listener: EventListener, options?: AddEventListenerOptions) {
    target.addEventListener(type, listener, options);
    this.listeners.push(() => target.removeEventListener(type, listener, options));
  }
}

export { contains as containsInputRect };
