export type LogicalCanvasSize = {
  readonly width: number;
  readonly height: number;
};

export type CanvasResolution = LogicalCanvasSize & {
  readonly pixelRatio: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
};

export type SurfaceRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export const MIN_CANVAS_WIDTH = 320;
export const MIN_CANVAS_HEIGHT = 520;
export const MIN_INTERACTIVE_SIZE = 44;
export const MAX_CANVAS_PIXEL_RATIO = 2;

const positiveFinite = (value: number) =>
  Number.isFinite(value) && value > 0 ? value : 0;

export function getLogicalCanvasSize(clientWidth: number, clientHeight: number): LogicalCanvasSize {
  return {
    width: Math.max(MIN_CANVAS_WIDTH, Math.floor(positiveFinite(clientWidth))),
    height: Math.max(MIN_CANVAS_HEIGHT, Math.floor(positiveFinite(clientHeight))),
  };
}

export function getCanvasPixelRatio(devicePixelRatio: number | undefined): number {
  const safeRatio = Number.isFinite(devicePixelRatio) && (devicePixelRatio ?? 0) > 0
    ? devicePixelRatio as number
    : 1;
  return Math.min(MAX_CANVAS_PIXEL_RATIO, Math.max(1, safeRatio));
}

export function getCanvasResolution(
  clientWidth: number,
  clientHeight: number,
  devicePixelRatio = 1,
): CanvasResolution {
  const logical = getLogicalCanvasSize(clientWidth, clientHeight);
  const pixelRatio = getCanvasPixelRatio(devicePixelRatio);
  return {
    ...logical,
    pixelRatio,
    pixelWidth: Math.max(1, Math.round(logical.width * pixelRatio)),
    pixelHeight: Math.max(1, Math.round(logical.height * pixelRatio)),
  };
}

export function expandHitbox(rect: SurfaceRect, minimumSize = MIN_INTERACTIVE_SIZE): SurfaceRect {
  const width = Math.max(rect.width, minimumSize);
  const height = Math.max(rect.height, minimumSize);
  return {
    x: rect.x - (width - rect.width) / 2,
    y: rect.y - (height - rect.height) / 2,
    width,
    height,
  };
}
