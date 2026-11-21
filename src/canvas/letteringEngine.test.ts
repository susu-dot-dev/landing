import { afterEach, beforeEach, describe, expect, it, rstest } from "@rstest/core";
import { IllustratorLettering, LETTERING_PALETTES } from "./index";

interface MockContext2D {
  save: ReturnType<typeof rstest.fn>;
  restore: ReturnType<typeof rstest.fn>;
  setTransform: ReturnType<typeof rstest.fn>;
  clearRect: ReturnType<typeof rstest.fn>;
  fillRect: ReturnType<typeof rstest.fn>;
  beginPath: ReturnType<typeof rstest.fn>;
  closePath: ReturnType<typeof rstest.fn>;
  moveTo: ReturnType<typeof rstest.fn>;
  lineTo: ReturnType<typeof rstest.fn>;
  arc: ReturnType<typeof rstest.fn>;
  fill: ReturnType<typeof rstest.fn>;
  stroke: ReturnType<typeof rstest.fn>;
  translate: ReturnType<typeof rstest.fn>;
  rotate: ReturnType<typeof rstest.fn>;
  fillText: ReturnType<typeof rstest.fn>;
  strokeText: ReturnType<typeof rstest.fn>;
  drawImage: ReturnType<typeof rstest.fn>;
  measureText: ReturnType<typeof rstest.fn>;
  getImageData: ReturnType<typeof rstest.fn>;
  font: string;
  textBaseline: CanvasTextBaseline;
  textAlign: CanvasTextAlign;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
}

function createMockCtx(options: { emptyMask?: boolean; charWidth?: number } = {}): MockContext2D {
  const { emptyMask = false, charWidth = 42 } = options;
  return {
    save: rstest.fn(),
    restore: rstest.fn(),
    setTransform: rstest.fn(),
    clearRect: rstest.fn(),
    fillRect: rstest.fn(),
    beginPath: rstest.fn(),
    closePath: rstest.fn(),
    moveTo: rstest.fn(),
    lineTo: rstest.fn(),
    arc: rstest.fn(),
    fill: rstest.fn(),
    stroke: rstest.fn(),
    translate: rstest.fn(),
    rotate: rstest.fn(),
    fillText: rstest.fn(),
    strokeText: rstest.fn(),
    drawImage: rstest.fn(),
    measureText: rstest.fn(() => ({ width: charWidth })),
    getImageData: rstest.fn((_x: number, _y: number, w: number, h: number) => {
      const data = new Uint8ClampedArray(w * h * 4);
      if (!emptyMask) {
        // Fill a centered interior block with alpha=255 so scanlines produce multi-band diagonal runs
        const x0 = Math.floor(w * 0.2);
        const x1 = Math.ceil(w * 0.8);
        const y0 = Math.floor(h * 0.2);
        const y1 = Math.ceil(h * 0.85);
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            data[(py * w + px) * 4 + 3] = 255;
          }
        }
      }
      return { data, width: w, height: h };
    }),
    font: "",
    textBaseline: "alphabetic",
    textAlign: "left",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
}

describe("IllustratorLettering", () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let rafSpy: ReturnType<typeof rstest.fn>;
  let cancelRafSpy: ReturnType<typeof rstest.fn>;
  let createdCanvases: HTMLCanvasElement[];
  let origCreateElement: typeof document.createElement;
  let origRaf: typeof globalThis.requestAnimationFrame;
  let origCancelRaf: typeof globalThis.cancelAnimationFrame;
  let origDpr: number;
  let origFontsDesc: PropertyDescriptor | undefined;
  let mockEmptyMask: boolean;
  let mockCharWidth: number;

  function mockCanvasRect(canvas: HTMLCanvasElement, width: number, height: number): void {
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: width,
        bottom: height,
        width,
        height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  function makeMainCanvas(
    width = 800,
    height = 220,
    withCtx = true,
  ): { canvas: HTMLCanvasElement; ctx: MockContext2D } {
    const canvas = origCreateElement.call(document, "canvas") as HTMLCanvasElement;
    const ctx = createMockCtx({ emptyMask: mockEmptyMask, charWidth: mockCharWidth });
    canvas.getContext = rstest.fn(() =>
      withCtx ? (ctx as unknown as CanvasRenderingContext2D) : null,
    ) as unknown as HTMLCanvasElement["getContext"];
    mockCanvasRect(canvas, width, height);
    return { canvas, ctx };
  }

  function flushNextRaf(timestamp: number): void {
    const first = rafCallbacks.entries().next();
    if (first.done) return;
    const [id, cb] = first.value;
    rafCallbacks.delete(id);
    cb(timestamp);
  }

  function setDocumentFonts(value: unknown): void {
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value,
    });
  }

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    createdCanvases = [];
    mockEmptyMask = false;
    mockCharWidth = 42;

    origRaf = globalThis.requestAnimationFrame;
    origCancelRaf = globalThis.cancelAnimationFrame;
    origCreateElement = document.createElement;
    origDpr = window.devicePixelRatio;
    origFontsDesc = Object.getOwnPropertyDescriptor(document, "fonts");

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
    // Default to no document.fonts for synchronous test determinism
    setDocumentFonts(undefined);

    rafSpy = rstest.fn((cb: FrameRequestCallback) => {
      const id = nextRafId++;
      rafCallbacks.set(id, cb);
      return id;
    });
    cancelRafSpy = rstest.fn((id: number) => {
      rafCallbacks.delete(id);
    });
    globalThis.requestAnimationFrame = rafSpy as unknown as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = cancelRafSpy as unknown as typeof cancelAnimationFrame;

    document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
      const el = origCreateElement.call(document, tagName, options);
      if (tagName.toLowerCase() === "canvas") {
        const canvas = el as HTMLCanvasElement;
        const offCtx = createMockCtx({ emptyMask: mockEmptyMask, charWidth: mockCharWidth });
        canvas.getContext = rstest.fn(
          () => offCtx as unknown as CanvasRenderingContext2D,
        ) as unknown as HTMLCanvasElement["getContext"];
        createdCanvases.push(canvas);
      }
      return el;
    }) as typeof document.createElement;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
    globalThis.cancelAnimationFrame = origCancelRaf;
    document.createElement = origCreateElement;
    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: origDpr,
    });
    if (origFontsDesc) {
      Object.defineProperty(document, "fonts", origFontsDesc);
    } else {
      setDocumentFonts(undefined);
    }
  });

  it("exposes all lettering palettes", () => {
    expect(Object.keys(LETTERING_PALETTES)).toEqual(["sumi", "twilight", "nocturne"]);
  });

  it("stops scheduling rAF automatically once shading completes and nib fades out", () => {
    const { canvas } = makeMainCanvas(800, 220);
    const baseTime = performance.now();
    const engine = new IllustratorLettering(canvas, {
      text: "s.d",
      palette: "sumi",
      medium: "marker",
    });

    expect(rafCallbacks.size).toBe(1);

    // Early outline phase (before shadeDelay)
    flushNextRaf(baseTime + 150);
    expect(rafCallbacks.size).toBe(1);

    // Mid shading (raw < 0.5)
    flushNextRaf(baseTime + 2000);
    expect(rafCallbacks.size).toBe(1);

    // Late shading (raw >= 0.5)
    flushNextRaf(baseTime + 5500);
    expect(rafCallbacks.size).toBe(1);

    // Shading complete, nib still fading
    flushNextRaf(baseTime + 7850);
    expect(rafCallbacks.size).toBe(1);

    // Past shadeDelay (520) + shadeDuration (7200) + nibFade (420) = 8140ms -> loop stops!
    flushNextRaf(performance.now() + 8500);
    expect(rafCallbacks.size).toBe(0);

    // Restarting via replay / setPalette / setMedium / resize schedules rAF again
    engine.replay();
    expect(rafCallbacks.size).toBe(1);

    engine.setPalette("twilight");
    expect(rafCallbacks.size).toBe(1);

    engine.setMedium("hatch");
    expect(rafCallbacks.size).toBe(1);
    flushNextRaf(performance.now() + 8500);
    expect(rafCallbacks.size).toBe(0);

    engine.setMedium("pencil");
    expect(rafCallbacks.size).toBe(1);
    flushNextRaf(performance.now() + 8500);
    expect(rafCallbacks.size).toBe(0);

    engine.setPalette("nocturne");
    flushNextRaf(performance.now() + 8500);
    expect(rafCallbacks.size).toBe(0);

    // Same-size resize is a no-op (prevents ResizeObserver initial mount from restarting animation)
    engine.resize();
    expect(rafCallbacks.size).toBe(0);

    // Actual size change triggers rebuild and restarts rAF
    canvas.getBoundingClientRect = () =>
      ({
        width: 960,
        height: 240,
        left: 0,
        top: 0,
        right: 960,
        bottom: 240,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    engine.resize();
    expect(rafCallbacks.size).toBe(1);

    engine.dispose();
  });

  it("schedules 0 rAF frames in reducedMotion mode and supports live toggling", () => {
    const { canvas, ctx } = makeMainCanvas(800, 220);
    const engine = new IllustratorLettering(canvas, {
      text: "s.d",
      reducedMotion: true,
    });

    expect(rafSpy).not.toHaveBeenCalled();
    expect(ctx.strokeText).toHaveBeenCalled();

    // Toggle reducedMotion off -> starts rAF loop
    engine.setReducedMotion(false);
    expect(rafSpy).toHaveBeenCalledTimes(1);

    // Stale tick callback fired after reducedMotion toggled back on is a no-op
    const staleCb = rafCallbacks.values().next().value as FrameRequestCallback;
    engine.setReducedMotion(true);
    expect(cancelRafSpy).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.size).toBe(0);
    staleCb(performance.now() + 100);
    expect(rafCallbacks.size).toBe(0);

    engine.dispose();
  });

  it("waits for document.fonts.ready once without double-building and ignores resolution after dispose", async () => {
    let resolveFonts!: () => void;
    const ready = new Promise<void>((res) => {
      resolveFonts = res;
    });
    setDocumentFonts({ ready });

    const { canvas } = makeMainCanvas(800, 220);
    const engine = new IllustratorLettering(canvas, { text: "ab" });

    // Before fonts resolve, only shadeCanvas is created and no rAF is scheduled yet
    expect(createdCanvases.length).toBe(1);
    expect(rafSpy).not.toHaveBeenCalled();

    resolveFonts();
    await ready;
    // After fonts resolve, glyphs are prepared once and rAF starts
    expect(rafSpy).toHaveBeenCalledTimes(1);
    engine.dispose();

    // Second instance disposed before fonts resolve
    let resolveFonts2!: () => void;
    const ready2 = new Promise<void>((res) => {
      resolveFonts2 = res;
    });
    setDocumentFonts({ ready: ready2 });

    const { canvas: canvas2 } = makeMainCanvas(800, 220);
    const engine2 = new IllustratorLettering(canvas2, { text: "ab" });
    engine2.dispose();
    resolveFonts2();
    await ready2;
    expect(rafSpy).toHaveBeenCalledTimes(1);
  });

  it("setText rebuilds glyphs synchronously without document.fonts, replays, and ignores disposed/no-ctx engines", () => {
    const { canvas } = makeMainCanvas(800, 220);
    const engine = new IllustratorLettering(canvas, { text: "ab" });
    const before = createdCanvases.length;
    flushNextRaf(performance.now() + 8500);
    expect(rafCallbacks.size).toBe(0);

    engine.setText("abc");
    expect(createdCanvases.length).toBeGreaterThan(before);
    expect(rafCallbacks.size).toBe(1);
    flushNextRaf(performance.now() + 8500);

    // Same text only replays
    const afterBuild = createdCanvases.length;
    engine.setText("abc");
    expect(createdCanvases.length).toBe(afterBuild);
    expect(rafCallbacks.size).toBe(1);

    engine.dispose();
    engine.setText("zzz");
    expect(createdCanvases.length).toBe(afterBuild);

    const { canvas: noCtx } = makeMainCanvas(800, 220, false);
    const inert = new IllustratorLettering(noCtx, { text: "ab" });
    inert.setText("cd");
    inert.dispose();
  });

  it("setText waits for the web font load and drops superseded or post-dispose results", async () => {
    let resolveLoad!: () => void;
    const load = rstest.fn(
      () =>
        new Promise<void>((res) => {
          resolveLoad = res;
        }),
    );
    setDocumentFonts({ load });

    const { canvas } = makeMainCanvas(800, 220);
    const engine = new IllustratorLettering(canvas, { text: "ab" });
    const before = createdCanvases.length;

    engine.setText("すす.dev");
    expect(load).toHaveBeenCalledTimes(1);
    expect(createdCanvases.length).toBe(before);
    const firstResolve = resolveLoad;

    engine.setText("小小.dev");
    firstResolve();
    await Promise.resolve();
    await Promise.resolve();
    // Superseded request must not rebuild
    expect(createdCanvases.length).toBe(before);

    resolveLoad();
    await Promise.resolve();
    await Promise.resolve();
    expect(createdCanvases.length).toBeGreaterThan(before);
    expect(rafCallbacks.size).toBe(1);

    engine.setText("another");
    engine.dispose();
    const afterDispose = createdCanvases.length;
    resolveLoad();
    await Promise.resolve();
    await Promise.resolve();
    expect(createdCanvases.length).toBe(afterDispose);
  });

  it("handles narrow canvas font downscaling, 0x0 rect fallback, dpr fallback, and empty masks", () => {
    // Force totalW > w * 0.88 so fontSize downscales
    mockCharWidth = 120;
    const { canvas } = makeMainCanvas(320, 140);
    const engine = new IllustratorLettering(canvas, { text: "susu.dev" });
    expect(rafCallbacks.size).toBe(1);
    engine.dispose();

    // Empty mask (rawSegs.length === 0) + 0x0 rect + dpr=0 fallback
    mockEmptyMask = true;
    mockCharWidth = 40;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 0 });
    const { canvas: c2 } = makeMainCanvas(0, 0);
    const engine2 = new IllustratorLettering(c2, { text: "x" });
    flushNextRaf(performance.now() + 8500);
    expect(rafCallbacks.size).toBe(0);
    engine2.dispose();
  });

  it("cancels rAF and zeroes all per-glyph and shade offscreen canvases on dispose (StrictMode safe)", () => {
    for (let mount = 0; mount < 2; mount++) {
      createdCanvases = [];
      const { canvas } = makeMainCanvas(800, 220);
      const engine = new IllustratorLettering(canvas, { text: "ab" });
      expect(rafCallbacks.size).toBe(1);
      // shadeCanvas + measureCanvas + 2 glyphs * (maskCanvas, hiMaskCanvas, colorCanvas) = 8 canvases
      expect(createdCanvases.length).toBeGreaterThanOrEqual(7);

      engine.dispose();

      expect(rafCallbacks.size).toBe(0);
      for (const off of createdCanvases) {
        expect(off.width).toBe(0);
        expect(off.height).toBe(0);
      }

      // Calling methods after dispose is a safe no-op
      engine.dispose();
      engine.setPalette("nocturne");
      engine.setMedium("hatch");
      engine.setReducedMotion(true);
      engine.replay();
      engine.resize();
      expect(engine.renderFrame(performance.now())).toBe(false);
    }
  });

  it("handles null 2D context gracefully", () => {
    const { canvas } = makeMainCanvas(800, 220, false);
    const engine = new IllustratorLettering(canvas);
    expect(rafSpy).not.toHaveBeenCalled();
    engine.setPalette("twilight");
    engine.setMedium("pencil");
    engine.setReducedMotion(true);
    engine.replay();
    engine.resize();
    expect(engine.renderFrame(100)).toBe(false);
    engine.dispose();
  });
});
