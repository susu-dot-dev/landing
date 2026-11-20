import { afterEach, beforeEach, describe, expect, it, rstest } from "@rstest/core";
import { CITYSCAPE_PALETTES, createRng, InkCityscape } from "./index";

interface MockContext2D {
  save: ReturnType<typeof rstest.fn>;
  restore: ReturnType<typeof rstest.fn>;
  setTransform: ReturnType<typeof rstest.fn>;
  clearRect: ReturnType<typeof rstest.fn>;
  fillRect: ReturnType<typeof rstest.fn>;
  strokeRect: ReturnType<typeof rstest.fn>;
  beginPath: ReturnType<typeof rstest.fn>;
  closePath: ReturnType<typeof rstest.fn>;
  moveTo: ReturnType<typeof rstest.fn>;
  lineTo: ReturnType<typeof rstest.fn>;
  quadraticCurveTo: ReturnType<typeof rstest.fn>;
  arc: ReturnType<typeof rstest.fn>;
  ellipse: ReturnType<typeof rstest.fn>;
  rect: ReturnType<typeof rstest.fn>;
  clip: ReturnType<typeof rstest.fn>;
  fill: ReturnType<typeof rstest.fn>;
  stroke: ReturnType<typeof rstest.fn>;
  translate: ReturnType<typeof rstest.fn>;
  scale: ReturnType<typeof rstest.fn>;
  rotate: ReturnType<typeof rstest.fn>;
  drawImage: ReturnType<typeof rstest.fn>;
  createLinearGradient: ReturnType<typeof rstest.fn>;
  createRadialGradient: ReturnType<typeof rstest.fn>;
  createPattern: ReturnType<typeof rstest.fn>;
  fillStyle: string | CanvasGradient;
  strokeStyle: string | CanvasGradient;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
}

function createMockCtx(): MockContext2D {
  const makeGradient = () => ({ addColorStop: rstest.fn() });
  return {
    save: rstest.fn(),
    restore: rstest.fn(),
    setTransform: rstest.fn(),
    clearRect: rstest.fn(),
    fillRect: rstest.fn(),
    strokeRect: rstest.fn(),
    beginPath: rstest.fn(),
    closePath: rstest.fn(),
    moveTo: rstest.fn(),
    lineTo: rstest.fn(),
    quadraticCurveTo: rstest.fn(),
    arc: rstest.fn(),
    ellipse: rstest.fn(),
    rect: rstest.fn(),
    clip: rstest.fn(),
    fill: rstest.fn(),
    stroke: rstest.fn(),
    translate: rstest.fn(),
    scale: rstest.fn(),
    rotate: rstest.fn(),
    drawImage: rstest.fn(),
    createLinearGradient: rstest.fn(makeGradient),
    createRadialGradient: rstest.fn(makeGradient),
    createPattern: rstest.fn(),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
  };
}

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => hidden,
  });
}

describe("prng & palettes", () => {
  it("produces deterministic sequences in [0, 1)", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 10; i++) {
      const va = a();
      const vb = b();
      expect(va).toBe(vb);
      expect(va).toBeGreaterThanOrEqual(0);
      expect(va).toBeLessThan(1);
    }
  });

  it("exposes all cityscape palettes", () => {
    expect(Object.keys(CITYSCAPE_PALETTES)).toEqual(["sumi", "twilight", "nocturne"]);
  });
});

describe("InkCityscape", () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let rafSpy: ReturnType<typeof rstest.fn>;
  let cancelRafSpy: ReturnType<typeof rstest.fn>;
  let createdCanvases: HTMLCanvasElement[];
  let ctxByCanvas: WeakMap<HTMLCanvasElement, MockContext2D>;
  let origCreateElement: typeof document.createElement;
  let origRaf: typeof globalThis.requestAnimationFrame;
  let origCancelRaf: typeof globalThis.cancelAnimationFrame;
  let origDpr: number;
  let returnNullForOffscreen: boolean;

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
    width = 1280,
    height = 720,
    withCtx = true,
  ): { canvas: HTMLCanvasElement; ctx: MockContext2D } {
    const canvas = origCreateElement.call(document, "canvas") as HTMLCanvasElement;
    const ctx = createMockCtx();
    ctxByCanvas.set(canvas, ctx);
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

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    createdCanvases = [];
    ctxByCanvas = new WeakMap();
    returnNullForOffscreen = false;

    origRaf = globalThis.requestAnimationFrame;
    origCancelRaf = globalThis.cancelAnimationFrame;
    origCreateElement = document.createElement;
    origDpr = window.devicePixelRatio;

    Object.defineProperty(window, "devicePixelRatio", {
      configurable: true,
      value: 2,
    });
    setDocumentHidden(false);

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
        const offCtx = createMockCtx();
        ctxByCanvas.set(canvas, offCtx);
        canvas.getContext = rstest.fn(() =>
          returnNullForOffscreen ? null : (offCtx as unknown as CanvasRenderingContext2D),
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
    setDocumentHidden(false);
  });

  it("schedules 0 rAF frames in reducedMotion mode and ignores pointer parallax", () => {
    const { canvas, ctx } = makeMainCanvas(1280, 720);
    const engine = new InkCityscape(canvas, { reducedMotion: true });

    expect(rafSpy).not.toHaveBeenCalled();
    expect(ctx.drawImage).toHaveBeenCalled();

    engine.handlePointerMove(100, 100);
    expect(rafSpy).not.toHaveBeenCalled();

    // Live toggle off -> starts rAF
    engine.setReducedMotion(false);
    expect(rafSpy).toHaveBeenCalledTimes(1);

    // Live toggle back on -> cancels rAF and renders static frame
    engine.setReducedMotion(true);
    expect(cancelRafSpy).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.size).toBe(0);

    engine.dispose();
  });

  it("makes 0 createRadialGradient and 0 createPattern calls during renderFrame()", () => {
    const { canvas, ctx } = makeMainCanvas(1280, 720);
    const engine = new InkCityscape(canvas, { palette: "sumi", seed: 11 });

    ctx.createRadialGradient.mockClear();
    ctx.createPattern.mockClear();

    engine.handlePointerMove(900, 200);
    engine.renderFrame(performance.now() + 100);
    engine.renderFrame(performance.now() + 200);

    expect(ctx.createRadialGradient).not.toHaveBeenCalled();
    expect(ctx.createPattern).not.toHaveBeenCalled();

    engine.dispose();
  });

  it("throttles animation loop to targetFps", () => {
    const { canvas, ctx } = makeMainCanvas(1280, 720);
    const engine = new InkCityscape(canvas, { targetFps: 30 });

    ctx.clearRect.mockClear();

    // First frame renders immediately (lastFrameTime === 0)
    flushNextRaf(1000);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);

    // 10ms later (< 33.33ms) -> skipped
    flushNextRaf(1010);
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);

    // 40ms later (>= 33.33ms) -> renders
    flushNextRaf(1040);
    expect(ctx.clearRect).toHaveBeenCalledTimes(2);

    engine.dispose();
  });

  it("pauses rAF when document.hidden becomes true and resumes when false", () => {
    const { canvas } = makeMainCanvas(1280, 720);
    const engine = new InkCityscape(canvas);

    expect(rafCallbacks.size).toBe(1);

    setDocumentHidden(true);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(cancelRafSpy).toHaveBeenCalledTimes(1);
    expect(rafCallbacks.size).toBe(0);

    setDocumentHidden(false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(rafCallbacks.size).toBe(1);

    // Explicit pause / unpause
    engine.setPaused(true);
    expect(rafCallbacks.size).toBe(0);
    engine.setPaused(true); // idempotent when already paused
    expect(rafCallbacks.size).toBe(0);

    engine.setPaused(false);
    expect(rafCallbacks.size).toBe(1);
    engine.setPaused(false); // idempotent when already running
    expect(rafCallbacks.size).toBe(1);

    // Stale tick callback fired after pause is a no-op
    const staleCb = rafCallbacks.values().next().value as FrameRequestCallback;
    engine.setPaused(true);
    staleCb(2000);
    expect(rafCallbacks.size).toBe(0);

    engine.dispose();
  });

  it("ignores minor height-only resizes (< 80px) and rebuilds on major or width resizes", () => {
    const { canvas, ctx } = makeMainCanvas(1000, 700);
    const engine = new InkCityscape(canvas);

    ctx.clearRect.mockClear();
    // Minor height change (50px < 80px) with same width -> ignored
    mockCanvasRect(canvas, 1000, 750);
    engine.resize();
    expect(ctx.clearRect).not.toHaveBeenCalled();
    expect(canvas.height).toBe(1400);

    // Major height change (100px >= 80px) -> rebuilds
    mockCanvasRect(canvas, 1000, 800);
    engine.resize();
    expect(ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(canvas.height).toBe(1600);

    // Width change -> rebuilds (narrow width < 780 exercises single-boat branch)
    mockCanvasRect(canvas, 600, 320);
    engine.resize();
    expect(canvas.width).toBe(1200);
    expect(canvas.height).toBe(640);

    // Fallback when rect is 0x0 and devicePixelRatio is 0
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 0 });
    mockCanvasRect(canvas, 0, 0);
    engine.resize();
    expect(canvas.width).toBeGreaterThanOrEqual(320);

    engine.dispose();
  });

  it("supports palette switching and regeneration across multiple seeds", () => {
    const { canvas } = makeMainCanvas(1440, 900);
    const engine = new InkCityscape(canvas, { palette: "sumi", seed: 11 });

    engine.setPalette("twilight");
    engine.setPalette("nocturne");
    engine.regenerate();
    for (let s = 1; s <= 12; s++) {
      engine.regenerate(s);
    }

    engine.dispose();
  });

  it("cancels rAF, removes visibilitychange listener, and zeroes offscreen canvases on dispose (StrictMode safe)", () => {
    const removeSpy = rstest.spyOn(document, "removeEventListener");

    // Simulate React 19 StrictMode double mount/unmount
    for (let mount = 0; mount < 2; mount++) {
      createdCanvases = [];
      const { canvas } = makeMainCanvas(1280, 720);
      const engine = new InkCityscape(canvas);
      expect(createdCanvases.length).toBe(3);
      expect(rafCallbacks.size).toBe(1);

      engine.dispose();

      expect(rafCallbacks.size).toBe(0);
      for (const off of createdCanvases) {
        expect(off.width).toBe(0);
        expect(off.height).toBe(0);
      }

      // Calling methods after dispose is a safe no-op
      engine.dispose();
      engine.setPalette("nocturne");
      engine.regenerate(99);
      engine.setReducedMotion(true);
      engine.setPaused(true);
      engine.handlePointerMove(10, 10);
      engine.resize();
      engine.renderFrame(performance.now());
    }

    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    removeSpy.mockRestore();
  });

  it("maps upperSceneCanvas 1:1 with overscan so dynamic windows align with baked frames", () => {
    const { canvas, ctx } = makeMainCanvas(1280, 720);
    const engine = new InkCityscape(canvas, { reducedMotion: true });

    const upperSceneCanvas = createdCanvases[0] as HTMLCanvasElement;
    const upperSceneCtx = ctxByCanvas.get(upperSceneCanvas) as MockContext2D;

    // dpr = 2, overscan = (8, 5) -> physical buffer is (1280 + 16) * 2 by (720 + 10) * 2
    expect(upperSceneCanvas.width).toBe((1280 + 16) * 2);
    expect(upperSceneCanvas.height).toBe((720 + 10) * 2);
    expect(upperSceneCtx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 16, 10);

    // Composited 1:1 at (-8, -5, w + 16, h + 10) so scene coordinates match dynamic overlays
    expect(ctx.drawImage).toHaveBeenCalledWith(upperSceneCanvas, -8, -5, 1280 + 16, 720 + 10);

    engine.dispose();
  });

  it("handles null 2D context gracefully on main and offscreen canvases", () => {
    const { canvas: nullMain } = makeMainCanvas(800, 600, false);
    const engine1 = new InkCityscape(nullMain);
    expect(rafSpy).not.toHaveBeenCalled();
    engine1.setPalette("twilight");
    engine1.regenerate(2);
    engine1.setReducedMotion(true);
    engine1.resize();
    engine1.renderFrame(100);
    engine1.dispose();

    returnNullForOffscreen = true;
    const { canvas: okMain } = makeMainCanvas(800, 600, true);
    const engine2 = new InkCityscape(okMain);
    engine2.dispose();
  });
});
