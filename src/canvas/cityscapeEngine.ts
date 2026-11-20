import { CITYSCAPE_PALETTES, type CityscapePalette } from "./palettes";
import { createRng, type Rng } from "./prng";
import type { CityscapeController, CityscapeOptions, PaletteKey } from "./types";

type BuildingArchetype =
  | "doublewide"
  | "townhouse"
  | "storefront"
  | "slender_spire"
  | "loft_studio"
  | "domed_hall";

interface WindowRect {
  x: number;
  y: number;
  w: number;
  h: number;
  arched: boolean;
  bright: boolean;
  phase: number;
  layer: "mid" | "hero";
}

interface Lantern {
  x: number;
  y: number;
  r: number;
  phase: number;
  isBridge: boolean;
}

interface Chimney {
  x: number;
  y: number;
  phase: number;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  phase: number;
}

interface BoatConfig {
  x: number;
  y: number;
  scale: number;
  flip: 1 | -1;
}

interface InkLineOptions {
  color?: string;
  width?: number;
  wobble?: number;
  overshoot?: number;
  alpha?: number;
  doublePass?: boolean;
}

interface HatchingOptions {
  spacing?: number;
  angle?: number;
  color?: string;
  lineWidth?: number;
  cross?: boolean;
}

const ARCHETYPES: readonly BuildingArchetype[] = [
  "doublewide",
  "townhouse",
  "storefront",
  "slender_spire",
  "loft_studio",
  "domed_hall",
];

const WINDOW_GLOW_SIZE = 32;
const LANTERN_GLOW_SIZE = 34;
const MINOR_HEIGHT_RESIZE_THRESHOLD = 80;
const SCENE_OVERSCAN_X = 8;
const SCENE_OVERSCAN_Y = 5;

export class InkCityscape implements CityscapeController {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private paletteKey: PaletteKey;
  private seed: number;
  private reducedMotion: boolean;
  private readonly frameInterval: number;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private waterY = 0;
  private hasSized = false;

  private readonly upperSceneCanvas: HTMLCanvasElement;
  private readonly upperSceneCtx: CanvasRenderingContext2D | null;
  private readonly windowGlowCanvas: HTMLCanvasElement;
  private readonly windowGlowCtx: CanvasRenderingContext2D | null;
  private readonly lanternGlowCanvas: HTMLCanvasElement;
  private readonly lanternGlowCtx: CanvasRenderingContext2D | null;

  private windows: WindowRect[] = [];
  private lanterns: Lantern[] = [];
  private chimneys: Chimney[] = [];
  private motes: Mote[] = [];

  private readonly pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
  private readonly startTime: number;
  private lastFrameTime = 0;
  private rafId: number | null = null;
  private paused = false;
  private hidden: boolean;
  private disposed = false;

  private readonly onVisibilityChange: () => void;
  private readonly tick: (now: number) => void;

  constructor(canvas: HTMLCanvasElement, opts: CityscapeOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.paletteKey = opts.palette ?? "sumi";
    this.seed = opts.seed ?? 11;
    this.reducedMotion = opts.reducedMotion ?? false;
    const targetFps = Math.max(1, opts.targetFps ?? 30);
    this.frameInterval = 1000 / targetFps;

    this.upperSceneCanvas = document.createElement("canvas");
    this.upperSceneCtx = this.upperSceneCanvas.getContext("2d");

    this.windowGlowCanvas = document.createElement("canvas");
    this.windowGlowCanvas.width = WINDOW_GLOW_SIZE;
    this.windowGlowCanvas.height = WINDOW_GLOW_SIZE;
    this.windowGlowCtx = this.windowGlowCanvas.getContext("2d");

    this.lanternGlowCanvas = document.createElement("canvas");
    this.lanternGlowCanvas.width = LANTERN_GLOW_SIZE;
    this.lanternGlowCanvas.height = LANTERN_GLOW_SIZE;
    this.lanternGlowCtx = this.lanternGlowCanvas.getContext("2d");

    this.startTime = performance.now();
    this.hidden = document.hidden;

    this.onVisibilityChange = () => {
      this.hidden = document.hidden;
      this.syncLoop();
    };

    this.tick = (now: number) => {
      this.rafId = null;
      if (!this.shouldRunLoop()) return;
      if (this.lastFrameTime === 0 || now - this.lastFrameTime >= this.frameInterval) {
        this.lastFrameTime = now;
        this.renderFrame(now);
      }
      this.rafId = requestAnimationFrame(this.tick);
    };

    document.addEventListener("visibilitychange", this.onVisibilityChange);

    if (this.ctx) {
      this.buildGlowSprites();
      this.resize();
      this.syncLoop();
    }
  }

  private get palette(): CityscapePalette {
    return CITYSCAPE_PALETTES[this.paletteKey];
  }

  private shouldRunLoop(): boolean {
    return (
      this.ctx !== null && !this.disposed && !this.reducedMotion && !this.paused && !this.hidden
    );
  }

  private syncLoop(): void {
    if (this.shouldRunLoop()) {
      if (this.rafId === null) {
        this.lastFrameTime = 0;
        this.rafId = requestAnimationFrame(this.tick);
      }
    } else if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setPalette(key: PaletteKey): void {
    if (this.disposed || !this.ctx) return;
    this.paletteKey = key;
    this.buildGlowSprites();
    this.rebuildScene();
    this.renderFrame(performance.now());
  }

  regenerate(newSeed?: number): void {
    if (this.disposed || !this.ctx) return;
    this.seed =
      newSeed !== undefined ? newSeed : (((this.seed * 1664525 + 1013904223) >>> 0) % 9973) + 1;
    this.rebuildScene();
    this.renderFrame(performance.now());
  }

  setReducedMotion(reduced: boolean): void {
    if (this.disposed || !this.ctx) return;
    this.reducedMotion = reduced;
    if (reduced) {
      this.pointer.x = 0.5;
      this.pointer.y = 0.5;
      this.pointer.tx = 0.5;
      this.pointer.ty = 0.5;
      this.syncLoop();
      this.renderFrame(this.startTime);
    } else {
      this.syncLoop();
    }
  }

  setPaused(paused: boolean): void {
    if (this.disposed) return;
    this.paused = paused;
    this.syncLoop();
  }

  handlePointerMove(clientX: number, clientY: number): void {
    if (this.disposed || this.reducedMotion) return;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.tx = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    this.pointer.ty = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)));
  }

  resize(): void {
    if (this.disposed || !this.ctx) return;
    const rect = this.canvas.getBoundingClientRect();
    const nextWidth = Math.max(320, Math.round(rect.width || window.innerWidth));
    const nextHeight = Math.max(320, Math.round(rect.height || window.innerHeight));
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);

    if (
      this.hasSized &&
      nextWidth === this.width &&
      nextDpr === this.dpr &&
      Math.abs(nextHeight - this.height) < MINOR_HEIGHT_RESIZE_THRESHOLD
    ) {
      return;
    }

    this.hasSized = true;
    this.width = nextWidth;
    this.height = nextHeight;
    this.dpr = nextDpr;

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.waterY = Math.round(this.height * 0.695);

    this.upperSceneCanvas.width = Math.round((this.width + SCENE_OVERSCAN_X * 2) * this.dpr);
    this.upperSceneCanvas.height = Math.round((this.height + SCENE_OVERSCAN_Y * 2) * this.dpr);

    this.rebuildScene();
    this.renderFrame(this.reducedMotion ? this.startTime : performance.now());
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    document.removeEventListener("visibilitychange", this.onVisibilityChange);

    this.upperSceneCanvas.width = 0;
    this.upperSceneCanvas.height = 0;
    this.windowGlowCanvas.width = 0;
    this.windowGlowCanvas.height = 0;
    this.lanternGlowCanvas.width = 0;
    this.lanternGlowCanvas.height = 0;
  }

  private buildGlowSprites(): void {
    const p = this.palette;

    if (this.windowGlowCtx) {
      const half = WINDOW_GLOW_SIZE / 2;
      this.windowGlowCtx.clearRect(0, 0, WINDOW_GLOW_SIZE, WINDOW_GLOW_SIZE);
      const wg = this.windowGlowCtx.createRadialGradient(half, half, 1, half, half, 15);
      wg.addColorStop(0, p.windowWarm);
      wg.addColorStop(1, "rgba(0,0,0,0)");
      this.windowGlowCtx.fillStyle = wg;
      this.windowGlowCtx.beginPath();
      this.windowGlowCtx.arc(half, half, 15, 0, Math.PI * 2);
      this.windowGlowCtx.fill();
    }

    if (this.lanternGlowCtx) {
      const half = LANTERN_GLOW_SIZE / 2;
      this.lanternGlowCtx.clearRect(0, 0, LANTERN_GLOW_SIZE, LANTERN_GLOW_SIZE);
      const lg = this.lanternGlowCtx.createRadialGradient(half, half, 0.5, half, half, 16);
      lg.addColorStop(0, p.windowBright);
      lg.addColorStop(0.32, p.lantern);
      lg.addColorStop(1, "rgba(0,0,0,0)");
      this.lanternGlowCtx.fillStyle = lg;
      this.lanternGlowCtx.beginPath();
      this.lanternGlowCtx.arc(half, half, 16, 0, Math.PI * 2);
      this.lanternGlowCtx.fill();
    }
  }

  private inkLine(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    rng: Rng,
    opts: InkLineOptions,
  ): void {
    const {
      color = this.palette.ink,
      width = 1.25,
      wobble = 0.9,
      overshoot = 1.8,
      alpha = 1,
      doublePass = false,
    } = opts;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.max(0.5, Math.hypot(dx, dy));

    const ux = dx / dist;
    const uy = dy / dist;
    const nx = -uy;
    const ny = ux;

    const sx = x1 - ux * overshoot * (0.4 + rng() * 0.6);
    const sy = y1 - uy * overshoot * (0.4 + rng() * 0.6);
    const ex = x2 + ux * overshoot * (0.4 + rng() * 0.6);
    const ey = y2 + uy * overshoot * (0.4 + rng() * 0.6);

    const steps = Math.max(2, Math.min(22, Math.ceil(dist / 16)));

    const strokeOnce = (wScale: number, aScale: number, wobbleScale: number) => {
      ctx.save();
      ctx.globalAlpha = alpha * aScale;
      ctx.strokeStyle = color;
      ctx.lineWidth = width * wScale;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const jitter = (rng() - 0.5) * 2 * wobble * wobbleScale;
        ctx.lineTo(sx + (ex - sx) * t + nx * jitter, sy + (ey - sy) * t + ny * jitter);
      }
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    };

    strokeOnce(1, 1, 1);
    if (doublePass) {
      strokeOnce(0.55, 0.42, 1.55);
    }
  }

  private drawHatching(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rng: Rng,
    opts: HatchingOptions,
  ): void {
    const {
      spacing = 5.5,
      angle = 0.68,
      color = this.palette.hatch,
      lineWidth = 0.72,
      cross = false,
    } = opts;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const drawPass = (ang: number, sp: number) => {
      const diag = Math.hypot(w, h);
      const cx = x + w * 0.5;
      const cy = y + h * 0.5;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      const px = -sin;
      const py = cos;

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";

      for (let d = -diag * 0.65; d <= diag * 0.65; d += sp) {
        const ox = cx + px * d;
        const oy = cy + py * d;
        const len = diag * 0.6;
        const j1 = (rng() - 0.5) * 1.4;
        const j2 = (rng() - 0.5) * 1.4;
        ctx.beginPath();
        ctx.moveTo(ox - cos * len + j1, oy - sin * len + j2);
        ctx.lineTo(ox + cos * len - j2, oy + sin * len + j1);
        ctx.stroke();
      }
    };

    drawPass(angle, spacing);
    if (cross) {
      drawPass(-angle * 0.75, spacing * 1.45);
    }
    ctx.restore();
  }

  private drawWashCloud(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: string,
    rng: Rng,
  ): void {
    ctx.save();
    for (let layer = 0; layer < 4; layer++) {
      const ox = (rng() - 0.5) * rx * 0.55;
      const oy = (rng() - 0.5) * ry * 0.45;
      const rrx = rx * (0.55 + rng() * 0.5);
      const rry = ry * (0.45 + rng() * 0.55);
      const grad = ctx.createRadialGradient(cx + ox, cy + oy, rrx * 0.08, cx + ox, cy + oy, rrx);
      grad.addColorStop(0, color);
      grad.addColorStop(0.68, color);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.scale(1, rry / rrx);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, rrx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private skylineHeightEnvelope(normX: number): number {
    const leftMass = Math.exp(-(((normX - 0.14) / 0.19) ** 2)) * 0.92;
    const rightMass = Math.exp(-(((normX - 0.85) / 0.21) ** 2)) * 0.96;
    const midAccent = Math.exp(-(((normX - 0.34) / 0.09) ** 2)) * 0.34;
    const midAccentR = Math.exp(-(((normX - 0.67) / 0.09) ** 2)) * 0.38;
    return Math.min(1.18, 0.22 + leftMass + rightMass + midAccent + midAccentR);
  }

  private rebuildScene(): void {
    const ctx = this.upperSceneCtx;
    if (!ctx) return;

    const p = this.palette;
    const w = this.width;
    const h = this.height;
    const wy = this.waterY;
    const rng = createRng(this.seed * 7919 + 17);

    this.windows = [];
    this.lanterns = [];
    this.chimneys = [];
    this.motes = [];

    ctx.save();
    ctx.setTransform(
      this.dpr,
      0,
      0,
      this.dpr,
      SCENE_OVERSCAN_X * this.dpr,
      SCENE_OVERSCAN_Y * this.dpr,
    );
    ctx.clearRect(
      -SCENE_OVERSCAN_X,
      -SCENE_OVERSCAN_Y,
      w + SCENE_OVERSCAN_X * 2,
      h + SCENE_OVERSCAN_Y * 2,
    );

    // 1. Sky Paper Gradient
    const skyGrad = ctx.createLinearGradient(0, -SCENE_OVERSCAN_Y, 0, wy);
    skyGrad.addColorStop(0, p.skyTop);
    skyGrad.addColorStop(0.56, p.skyMid);
    skyGrad.addColorStop(1, p.skyHorizon);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(
      -SCENE_OVERSCAN_X,
      -SCENE_OVERSCAN_Y,
      w + SCENE_OVERSCAN_X * 2,
      wy + SCENE_OVERSCAN_Y + 2,
    );

    // 2. Atmospheric ink-wash clouds
    for (let i = 0; i < 11; i++) {
      const cx = rng() * w;
      const cy = wy * (0.48 + rng() * 0.42);
      const rx = w * (0.1 + rng() * 0.18);
      const ry = wy * (0.04 + rng() * 0.08);
      this.drawWashCloud(ctx, cx, cy, rx, ry, p.cloudWash, rng);
    }

    // Faint ink-splatter speckles in outer margins of sky
    ctx.fillStyle = p.inkSoft;
    for (let i = 0; i < 28; i++) {
      const sx = rng() * w;
      const sy = rng() * wy * 0.85;
      if (sx > w * 0.2 && sx < w * 0.8 && sy < wy * 0.55) continue;
      const r = 0.45 + rng() * 1.15;
      ctx.globalAlpha = 0.09 + rng() * 0.14;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawInkBirds(ctx, w, wy, rng);

    // 3. Far Misty Ridge Wash
    this.drawFarHills(ctx, w, wy, rng);

    // 4. Far Hazy Ink-Wash Skyline
    this.drawFarSkyline(ctx, w, wy, rng);

    // 5. Midground Layered Cityscape
    this.drawMidSkyline(ctx, w, wy, rng);

    // 6. Central Arched Stone Canal Bridge
    this.drawCanalBridge(ctx, w, wy, rng);

    // 7. Dense Hand-Inked Waterfront Townhouse Skyline
    this.drawHeroWaterfront(ctx, w, wy, rng);

    // 8. Waterfront Stone Quay Wall, Wooden Pilings & Still Ink-Wash Water
    const pilings = this.drawQuayAndPilings(ctx, w, wy, rng);
    this.drawStillInkWater(ctx, w, h, wy, pilings, rng);

    // 10. Subtle atmospheric lantern motes in upper air
    for (let i = 0; i < 20; i++) {
      this.motes.push({
        x: rng() * w,
        y: wy * (0.45 + rng() * 0.5),
        r: 0.8 + rng() * 1.6,
        vx: (rng() - 0.5) * 6,
        vy: -(2.5 + rng() * 6),
        phase: rng() * Math.PI * 2,
      });
    }

    ctx.restore();
  }

  private drawInkBirds(ctx: CanvasRenderingContext2D, w: number, wy: number, rng: Rng): void {
    const p = this.palette;
    const flockSide = rng() > 0.5 ? 0.14 : 0.84;
    const baseX = w * flockSide;
    const baseY = wy * (0.26 + rng() * 0.16);
    ctx.save();
    ctx.strokeStyle = p.inkSoft;
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    for (let i = 0; i < 4; i++) {
      const bx = baseX + (rng() - 0.5) * 85;
      const by = baseY + (rng() - 0.5) * 42;
      const span = 4.5 + rng() * 4.5;
      ctx.globalAlpha = 0.35 + rng() * 0.3;
      ctx.beginPath();
      ctx.moveTo(bx - span, by + 1.5);
      ctx.quadraticCurveTo(bx - span * 0.4, by - span * 0.45, bx, by);
      ctx.quadraticCurveTo(bx + span * 0.4, by - span * 0.45, bx + span, by + 1.2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawFarHills(ctx: CanvasRenderingContext2D, w: number, wy: number, rng: Rng): void {
    const p = this.palette;
    ctx.save();
    ctx.fillStyle = p.farHill;
    ctx.beginPath();
    ctx.moveTo(0, wy);
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = t * w;
      const hill =
        Math.sin(t * Math.PI * 2.1 + 0.6) * 22 +
        Math.cos(t * Math.PI * 4.2 + rng() * 0.6) * 11 +
        (Math.abs(t - 0.5) < 0.22 ? -18 : 8);
      const y = wy - wy * 0.24 - hill;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, wy);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawFarSkyline(ctx: CanvasRenderingContext2D, w: number, wy: number, rng: Rng): void {
    const p = this.palette;
    ctx.save();
    ctx.fillStyle = p.farCity;
    let x = -10;
    while (x < w + 20) {
      const bw = 22 + rng() * 42;
      const env = this.skylineHeightEnvelope((x + bw * 0.5) / w);
      const bh = wy * (0.14 + env * 0.28 + rng() * 0.08);
      const topY = wy - bh;

      ctx.beginPath();
      ctx.moveTo(x, wy);
      ctx.lineTo(x, topY);
      const roofKind = rng();
      if (roofKind < 0.3) {
        ctx.lineTo(x + bw * 0.5, topY - 10 - rng() * 14);
        ctx.lineTo(x + bw, topY);
      } else if (roofKind < 0.52) {
        ctx.lineTo(x + bw * 0.2, topY);
        ctx.lineTo(x + bw * 0.2, topY - 11);
        ctx.lineTo(x + bw * 0.8, topY - 11);
        ctx.lineTo(x + bw * 0.8, topY);
        ctx.lineTo(x + bw, topY);
      } else if (roofKind < 0.64) {
        ctx.quadraticCurveTo(x + bw * 0.5, topY - 24, x + bw, topY);
      } else {
        ctx.lineTo(x + bw, topY);
      }
      ctx.lineTo(x + bw, wy);
      ctx.closePath();
      ctx.fill();

      if (rng() > 0.78 && env > 0.55) {
        ctx.strokeStyle = p.farCity;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + bw * 0.5, topY - 6);
        ctx.lineTo(x + bw * 0.5, topY - 28 - rng() * 20);
        ctx.stroke();
      }
      x += bw * (0.72 + rng() * 0.32);
    }

    const mist = ctx.createLinearGradient(0, wy - wy * 0.26, 0, wy);
    mist.addColorStop(0, "rgba(0,0,0,0)");
    mist.addColorStop(0.65, p.cloudWash);
    mist.addColorStop(1, p.skyHorizon);
    ctx.fillStyle = mist;
    ctx.globalAlpha = 0.52;
    ctx.fillRect(-SCENE_OVERSCAN_X, wy - wy * 0.28, w + SCENE_OVERSCAN_X * 2, wy * 0.28);
    ctx.restore();
  }

  private drawMidSkyline(ctx: CanvasRenderingContext2D, w: number, wy: number, rng: Rng): void {
    const p = this.palette;
    let x = -8;
    while (x < w + 16) {
      const bw = 28 + rng() * 48;
      const normX = (x + bw * 0.5) / w;
      if (normX > 0.42 && normX < 0.58) {
        x += bw * 0.85;
        continue;
      }
      const env = this.skylineHeightEnvelope(normX);
      const bh = wy * (0.14 + env * 0.24 + rng() * 0.08);
      const topY = wy - bh;

      ctx.save();
      ctx.fillStyle = p.midCityFill;
      ctx.fillRect(x, topY, bw, bh);

      ctx.fillStyle = p.midCityWash;
      ctx.fillRect(x + bw * 0.58, topY, bw * 0.42, bh);

      const rType = rng();
      if (rType < 0.45) {
        const peak = 10 + rng() * 18;
        ctx.fillStyle = p.midCityWash;
        ctx.beginPath();
        ctx.moveTo(x - 2, topY);
        ctx.lineTo(x + bw * 0.5, topY - peak);
        ctx.lineTo(x + bw + 2, topY);
        ctx.closePath();
        ctx.fill();
        this.inkLine(ctx, x - 2, topY, x + bw * 0.5, topY - peak, rng, {
          color: p.midCityInk,
          width: 1.0,
          overshoot: 1.2,
        });
        this.inkLine(ctx, x + bw * 0.5, topY - peak, x + bw + 2, topY, rng, {
          color: p.midCityInk,
          width: 1.0,
          overshoot: 1.2,
        });
      } else {
        this.inkLine(ctx, x, topY, x + bw, topY, rng, {
          color: p.midCityInk,
          width: 1.1,
          overshoot: 1.4,
        });
      }

      this.inkLine(ctx, x, topY, x, wy, rng, { color: p.midCityInk, width: 0.9, overshoot: 1 });
      this.inkLine(ctx, x + bw, topY, x + bw, wy, rng, {
        color: p.midCityInk,
        width: 0.9,
        overshoot: 1,
      });

      this.drawHatching(ctx, x + bw * 0.58, topY + 2, bw * 0.4, bh - 6, rng, {
        spacing: 6.5,
        color: p.hatch,
        lineWidth: 0.55,
      });

      const cols = Math.max(1, Math.floor(bw / 13));
      const rows = Math.max(1, Math.floor(bh / 22));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rng() > 0.79) {
            const wx = x + 6 + c * ((bw - 12) / cols);
            const wyPos = topY + 12 + r * 17;
            this.windows.push({
              x: wx,
              y: wyPos,
              w: 3.4,
              h: 5.5,
              arched: false,
              bright: rng() > 0.55,
              phase: rng() * Math.PI * 2,
              layer: "mid",
            });
          }
        }
      }
      ctx.restore();
      x += bw * (0.76 + rng() * 0.24);
    }
  }

  private drawCanalBridge(ctx: CanvasRenderingContext2D, w: number, wy: number, rng: Rng): void {
    const p = this.palette;
    const bx1 = w * 0.36;
    const bx2 = w * 0.64;
    const bw = bx2 - bx1;
    const deckY = wy - Math.max(30, wy * 0.115);
    const archCount = 3;
    const span = bw / archCount;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bx1, wy);
    ctx.lineTo(bx1, deckY);
    ctx.lineTo(bx2, deckY);
    ctx.lineTo(bx2, wy);
    for (let i = archCount - 1; i >= 0; i--) {
      const ax2 = bx1 + (i + 1) * span - span * 0.11;
      const ax1 = bx1 + i * span + span * 0.11;
      const acx = (ax1 + ax2) * 0.5;
      const archR = (ax2 - ax1) * 0.5;
      const archTop = deckY + 12;
      ctx.lineTo(ax2, wy);
      ctx.lineTo(ax2, Math.max(archTop + archR * 0.55, wy - 8));
      ctx.quadraticCurveTo(acx, archTop - 2, ax1, Math.max(archTop + archR * 0.55, wy - 8));
      ctx.lineTo(ax1, wy);
    }
    ctx.closePath();
    ctx.fillStyle = p.heroFillDark;
    ctx.fill();

    ctx.fillStyle = p.heroWash;
    ctx.fillRect(bx1, deckY, bw, 10);

    for (let i = 0; i <= archCount; i++) {
      const px = bx1 + i * span - span * 0.1;
      this.drawHatching(ctx, px, deckY + 8, span * 0.2, wy - deckY - 8, rng, {
        spacing: 5,
        cross: true,
        color: p.hatch,
      });
    }

    this.inkLine(ctx, bx1, deckY, bx2, deckY, rng, { width: 1.8, doublePass: true });
    this.inkLine(ctx, bx1, deckY - 6, bx2, deckY - 6, rng, { width: 1.15 });
    this.inkLine(ctx, bx1, deckY + 6, bx2, deckY + 6, rng, { width: 0.9, alpha: 0.65 });

    for (let i = 0; i <= archCount; i++) {
      const lx = bx1 + i * span;
      this.inkLine(ctx, lx, deckY - 6, lx, deckY - 22, rng, { width: 1.25 });
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(lx + 3, deckY - 22, 3, Math.PI, 0);
      ctx.stroke();

      this.lanterns.push({
        x: lx + 6,
        y: deckY - 20,
        r: 2.8,
        phase: rng() * Math.PI * 2,
        isBridge: true,
      });
    }

    for (let i = 0; i < archCount; i++) {
      const ax1 = bx1 + i * span + span * 0.11;
      const ax2 = bx1 + (i + 1) * span - span * 0.11;
      const acx = (ax1 + ax2) * 0.5;
      const archTop = deckY + 12;
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.45;
      ctx.beginPath();
      ctx.moveTo(ax1, wy);
      ctx.quadraticCurveTo(acx, archTop - 10, ax2, wy);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawHeroWaterfront(ctx: CanvasRenderingContext2D, w: number, wy: number, rng: Rng): void {
    const quayTop = wy - 14;

    const segments = [
      { start: -12, end: w * 0.405 },
      { start: w * 0.595, end: w + 16 },
    ];

    const shuffle = (arr: readonly BuildingArchetype[]): BuildingArchetype[] => {
      const copy = [...arr];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = copy[i] as BuildingArchetype;
        copy[i] = copy[j] as BuildingArchetype;
        copy[j] = tmp;
      }
      return copy;
    };

    segments.forEach((seg, segIdx) => {
      let x = seg.start;
      let lastType: BuildingArchetype | null = null;
      let deck = shuffle(ARCHETYPES);
      let deckIdx = 0;

      while (x < seg.end) {
        const remaining = seg.end - x;

        let type = deck[deckIdx % deck.length] as BuildingArchetype;
        deckIdx++;
        if (deckIdx % deck.length === 0) deck = shuffle(ARCHETYPES);
        if (type === lastType) {
          type = deck[deckIdx % deck.length] as BuildingArchetype;
          deckIdx++;
        }

        if (remaining < 64 && (type === "doublewide" || type === "domed_hall")) {
          type = rng() > 0.5 ? "storefront" : "townhouse";
        }

        let bw: number;
        let heightMult: number;
        if (type === "doublewide") {
          bw = Math.min(remaining + 6, 92 + rng() * 34);
          heightMult = 0.72 + rng() * 0.16;
        } else if (type === "storefront") {
          bw = Math.min(remaining + 6, 54 + rng() * 24);
          heightMult = 0.34 + rng() * 0.12;
        } else if (type === "slender_spire") {
          bw = Math.min(remaining + 6, 30 + rng() * 11);
          heightMult = 0.96 + rng() * 0.14;
        } else if (type === "loft_studio") {
          bw = Math.min(remaining + 6, 66 + rng() * 24);
          heightMult = 0.54 + rng() * 0.14;
        } else if (type === "domed_hall") {
          bw = Math.min(remaining + 6, 72 + rng() * 24);
          heightMult = 0.6 + rng() * 0.14;
        } else {
          bw = Math.min(remaining + 6, 40 + rng() * 18);
          heightMult = 0.76 + rng() * 0.2;
        }

        const normX = (x + bw * 0.5) / w;
        const env = this.skylineHeightEnvelope(normX);
        const bridgeTaper =
          segIdx === 0
            ? Math.min(1, (seg.end - (x + bw * 0.4)) / (w * 0.13) + 0.42)
            : Math.min(1, (x + bw * 0.6 - seg.start) / (w * 0.13) + 0.42);

        const baseH = wy * (0.14 + env * 0.29 * bridgeTaper);
        const rawBh = baseH * heightMult + (type === "storefront" ? 24 : 28);
        const minBh = type === "storefront" ? 54 : 74;
        const maxBh = type === "slender_spire" ? wy * 0.48 : wy * 0.5;
        const bh = Math.min(maxBh, Math.max(minBh, rawBh));
        const topY = quayTop - bh;

        this.drawBuildingArchetype(ctx, x, topY, bw, bh, type, rng);

        x += bw - (1.5 + rng() * 3.5);
        lastType = type;
      }
    });
  }

  private drawBuildingArchetype(
    ctx: CanvasRenderingContext2D,
    x: number,
    topY: number,
    bw: number,
    bh: number,
    type: BuildingArchetype,
    rng: Rng,
  ): number {
    const p = this.palette;
    const baseY = topY + bh;
    const sideShadeW = bw * (type === "doublewide" ? 0.22 : 0.28 + rng() * 0.16);

    const wallPick = rng();
    const wallColor =
      wallPick < 0.34 ? p.heroFillLight : wallPick < 0.67 ? p.heroFillMid : p.heroFillDark;
    ctx.fillStyle = wallColor;
    ctx.fillRect(x, topY, bw, bh);

    ctx.fillStyle = p.heroWash;
    ctx.fillRect(x + bw - sideShadeW, topY, sideShadeW, bh);

    this.drawHatching(ctx, x + bw - sideShadeW, topY + 2, sideShadeW - 1, bh - 4, rng, {
      spacing: 4.8 + rng() * 1.4,
      cross: rng() > 0.45,
      color: p.hatch,
      lineWidth: 0.72,
    });

    this.drawHatching(ctx, x + 1, topY, bw - 2, 10, rng, {
      spacing: 4.2,
      angle: 0.25,
      color: p.hatch,
      lineWidth: 0.64,
    });

    let roofPeakY = topY;

    // 1. Archetype-specific roofs
    ctx.fillStyle = p.heroRoof;
    if (type === "storefront") {
      if (rng() > 0.45) {
        const signH = 12;
        roofPeakY = topY - signH;
        ctx.fillStyle = wallColor;
        ctx.fillRect(x + 2, roofPeakY, bw - 4, signH);
        this.inkLine(ctx, x - 3, roofPeakY, x + bw + 3, roofPeakY, rng, {
          width: 1.9,
          doublePass: true,
        });
        this.inkLine(ctx, x - 2, topY, x + bw + 2, topY, rng, { width: 1.4 });
        this.inkLine(ctx, x + 2, roofPeakY, x + 2, topY, rng, { width: 1.2 });
        this.inkLine(ctx, x + bw - 2, roofPeakY, x + bw - 2, topY, rng, { width: 1.2 });
        this.inkLine(ctx, x + 8, roofPeakY + 4, x + bw - 8, roofPeakY + 4, rng, {
          width: 0.8,
          alpha: 0.55,
        });
        this.inkLine(ctx, x + 8, roofPeakY + 8, x + bw - 8, roofPeakY + 8, rng, {
          width: 0.8,
          alpha: 0.55,
        });
      } else {
        const eh = 13 + rng() * 8;
        roofPeakY = topY - eh;
        ctx.beginPath();
        ctx.moveTo(x - 9, topY + 2);
        ctx.quadraticCurveTo(x + bw * 0.25, topY - eh * 0.42, x + bw * 0.5, roofPeakY);
        ctx.quadraticCurveTo(x + bw * 0.75, topY - eh * 0.42, x + bw + 9, topY + 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.75;
        ctx.stroke();
      }
    } else if (type === "doublewide") {
      if (rng() > 0.4) {
        const mh = 18 + rng() * 10;
        roofPeakY = topY - mh;
        ctx.beginPath();
        ctx.moveTo(x - 4, topY + 1);
        ctx.lineTo(x + 11, roofPeakY);
        ctx.lineTo(x + bw - 11, roofPeakY);
        ctx.lineTo(x + bw + 4, topY + 1);
        ctx.closePath();
        ctx.fill();
        this.inkLine(ctx, x - 4, topY + 1, x + 11, roofPeakY, rng, { width: 1.6 });
        this.inkLine(ctx, x + 11, roofPeakY, x + bw - 11, roofPeakY, rng, {
          width: 1.75,
          doublePass: true,
        });
        this.inkLine(ctx, x + bw - 11, roofPeakY, x + bw + 4, topY + 1, rng, { width: 1.6 });
        this.inkLine(ctx, x - 5, topY + 1, x + bw + 5, topY + 1, rng, { width: 1.5 });

        const dormers = bw > 105 ? 3 : 2;
        for (let d = 0; d < dormers; d++) {
          const dx = x + 18 + ((bw - 36) * (d + 0.5)) / dormers;
          const dy = topY - mh * 0.56;
          ctx.fillStyle = p.heroFillLight;
          ctx.fillRect(dx - 4, dy, 8, 9);
          ctx.strokeStyle = p.ink;
          ctx.lineWidth = 1;
          ctx.strokeRect(dx - 4, dy, 8, 9);
          this.inkLine(ctx, dx - 5.5, dy, dx, dy - 4.5, rng, { width: 1.15, overshoot: 0.4 });
          this.inkLine(ctx, dx, dy - 4.5, dx + 5.5, dy, rng, { width: 1.15, overshoot: 0.4 });
        }
      } else {
        const stepH = 10;
        roofPeakY = topY - stepH;
        ctx.fillStyle = wallColor;
        ctx.fillRect(x + 10, roofPeakY, bw - 20, stepH);
        this.inkLine(ctx, x - 3, topY, x + bw + 3, topY, rng, { width: 1.8, doublePass: true });
        this.inkLine(ctx, x + 10, roofPeakY, x + bw - 10, roofPeakY, rng, { width: 1.4 });
        this.inkLine(ctx, x + 10, roofPeakY, x + 10, topY, rng, { width: 1.1 });
        this.inkLine(ctx, x + bw - 10, roofPeakY, x + bw - 10, topY, rng, { width: 1.1 });

        const tx = x + bw * 0.22;
        const ty = roofPeakY - 22;
        ctx.fillStyle = p.heroRoof;
        ctx.fillRect(tx, ty, 16, 15);
        this.inkLine(ctx, tx + 2, ty + 15, tx + 2, roofPeakY, rng, { width: 1.1 });
        this.inkLine(ctx, tx + 14, ty + 15, tx + 14, roofPeakY, rng, { width: 1.1 });
        this.inkLine(ctx, tx - 2, ty, tx + 8, ty - 7, rng, { width: 1.25 });
        this.inkLine(ctx, tx + 8, ty - 7, tx + 18, ty, rng, { width: 1.25 });
      }
    } else if (type === "slender_spire") {
      const capH = 26 + rng() * 18;
      roofPeakY = topY - capH;
      ctx.beginPath();
      ctx.moveTo(x - 4, topY + 1);
      ctx.lineTo(x + bw * 0.5, roofPeakY);
      ctx.lineTo(x + bw + 4, topY + 1);
      ctx.closePath();
      ctx.fill();
      this.inkLine(ctx, x - 4, topY + 1, x + bw * 0.5, roofPeakY, rng, {
        width: 1.75,
        doublePass: true,
      });
      this.inkLine(ctx, x + bw * 0.5, roofPeakY, x + bw + 4, topY + 1, rng, {
        width: 1.75,
        doublePass: true,
      });
      this.inkLine(ctx, x - 4, topY + 1, x + bw + 4, topY + 1, rng, { width: 1.3 });
      this.inkLine(ctx, x + bw * 0.5, roofPeakY, x + bw * 0.5, roofPeakY - 18 - rng() * 10, rng, {
        width: 1.15,
        overshoot: 0.4,
      });
    } else if (type === "loft_studio") {
      if (rng() > 0.45) {
        const leftHigh = rng() > 0.5;
        const sh = 18 + rng() * 12;
        roofPeakY = topY - sh;
        ctx.beginPath();
        ctx.moveTo(x - 3, topY + 1);
        ctx.lineTo(x - 2, leftHigh ? roofPeakY : topY - 4);
        ctx.lineTo(x + bw + 2, leftHigh ? topY - 4 : roofPeakY);
        ctx.lineTo(x + bw + 3, topY + 1);
        ctx.closePath();
        ctx.fill();
        this.inkLine(
          ctx,
          x - 4,
          leftHigh ? roofPeakY : topY - 4,
          x + bw + 4,
          leftHigh ? topY - 4 : roofPeakY,
          rng,
          { width: 1.9, doublePass: true },
        );
        this.inkLine(ctx, x - 3, topY + 1, x + bw + 3, topY + 1, rng, { width: 1.25 });
      } else {
        const steps = 3;
        const stepH = 7;
        roofPeakY = topY - steps * stepH;
        ctx.fillStyle = wallColor;
        for (let s = 0; s < steps; s++) {
          const inset = (s + 1) * (bw * 0.13);
          const sy = topY - (s + 1) * stepH;
          ctx.fillRect(x + inset, sy, bw - inset * 2, stepH + 1);
          this.inkLine(ctx, x + inset, sy, x + bw - inset, sy, rng, { width: 1.55 });
          this.inkLine(ctx, x + inset, sy, x + inset, sy + stepH, rng, { width: 1.3 });
          this.inkLine(ctx, x + bw - inset, sy, x + bw - inset, sy + stepH, rng, { width: 1.3 });
        }
        this.inkLine(ctx, x - 2, topY, x + bw + 2, topY, rng, { width: 1.4 });
      }
    } else if (type === "domed_hall") {
      const domeR = Math.min(bw * 0.36, 30);
      const drumH = 8;
      roofPeakY = topY - drumH - domeR;

      ctx.fillStyle = wallColor;
      ctx.fillRect(x + bw * 0.5 - domeR, topY - drumH, domeR * 2, drumH);
      this.inkLine(ctx, x - 3, topY, x + bw + 3, topY, rng, { width: 1.75, doublePass: true });

      ctx.fillStyle = p.heroRoof;
      ctx.beginPath();
      ctx.arc(x + bw * 0.5, topY - drumH, domeR, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.65;
      ctx.stroke();

      const fx = x + bw * 0.5;
      const fy = topY - drumH - domeR;
      this.inkLine(ctx, fx, fy, fx, fy - 12, rng, { width: 1.15, overshoot: 0.3 });
      ctx.beginPath();
      ctx.arc(fx, fy - 4, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.heroRoof;
      ctx.fill();
    } else {
      const peakH = 16 + rng() * 20;
      roofPeakY = topY - peakH;
      ctx.beginPath();
      ctx.moveTo(x - 4, topY + 2);
      ctx.lineTo(x + bw * 0.5, roofPeakY);
      ctx.lineTo(x + bw + 4, topY + 2);
      ctx.closePath();
      ctx.fill();
      this.inkLine(ctx, x - 5, topY + 2, x + bw * 0.5, roofPeakY, rng, {
        width: 1.8,
        doublePass: true,
      });
      this.inkLine(ctx, x + bw * 0.5, roofPeakY, x + bw + 5, topY + 2, rng, {
        width: 1.8,
        doublePass: true,
      });
      this.inkLine(ctx, x - 4, topY + 2, x + bw + 4, topY + 2, rng, { width: 1.3 });

      if (bw > 38) {
        ctx.beginPath();
        ctx.arc(x + bw * 0.5, topY - peakH * 0.36, 3.6, 0, Math.PI * 2);
        ctx.fillStyle = p.heroFillLight;
        ctx.fill();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Occasional chimney with animated rising smoke
    if (type !== "domed_hall" && rng() > 0.64) {
      const cx = x + bw * (0.2 + rng() * 0.6);
      const cy = Math.min(topY - 3, roofPeakY + 12);
      ctx.fillStyle = p.heroRoof;
      ctx.fillRect(cx - 3.5, cy - 13, 7, 15);
      this.inkLine(ctx, cx - 4.5, cy - 13, cx + 4.5, cy - 13, rng, { width: 1.3 });
      this.chimneys.push({ x: cx, y: cy - 14, phase: rng() * Math.PI * 2 });
    }

    // Crisp vertical dip-pen edges
    this.inkLine(ctx, x, topY, x, baseY, rng, { width: 1.55, doublePass: true });
    this.inkLine(ctx, x + bw, topY, x + bw, baseY, rng, { width: 1.55, doublePass: true });

    // 2. Archetype-specific facades, windows & ground floors
    if (type === "storefront") {
      const shopTop = baseY - 26;
      this.inkLine(ctx, x + 2, shopTop - 5, x + bw - 2, shopTop - 5, rng, { width: 1.15 });

      const doorW = Math.min(13, bw * 0.22);
      const doorX = x + 7;
      ctx.fillStyle = p.heroRoof;
      ctx.fillRect(doorX, baseY - 20, doorW, 20);
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1;
      ctx.strokeRect(doorX, baseY - 20, doorW, 20);

      const sw = Math.max(18, bw - doorW - 22);
      const sx = doorX + doorW + 6;
      const sy = baseY - 20;
      const sh = 14;
      this.windows.push({
        x: sx,
        y: sy,
        w: sw,
        h: sh,
        arched: false,
        bright: true,
        phase: rng() * Math.PI * 2,
        layer: "hero",
      });
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.05;
      ctx.strokeRect(sx, sy, sw, sh);
      this.inkLine(ctx, sx + sw * 0.5, sy, sx + sw * 0.5, sy + sh, rng, {
        width: 0.75,
        overshoot: 0,
      });

      ctx.fillStyle = p.heroRoof;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy - 5);
      ctx.lineTo(sx + sw + 3, sy - 5);
      ctx.lineTo(sx + sw + 5, sy + 1);
      ctx.lineTo(sx - 5, sy + 1);
      ctx.closePath();
      ctx.fill();

      const uCols = bw > 62 ? 3 : 2;
      const uStep = (bw - 14) / uCols;
      for (let c = 0; c < uCols; c++) {
        const wx = x + 7 + c * uStep + (uStep - 7) * 0.5;
        const wyPos = topY + 12;
        this.drawWindowUnit(ctx, wx, wyPos, 7, 11, rng() > 0.55, false, rng);
      }
    } else if (type === "doublewide") {
      const cols = Math.max(4, Math.floor((bw - 14) / 16));
      const rows = Math.max(2, Math.floor((bh - 36) / 24));
      const stepX = (bw - 16) / cols;

      // Subtle horizontal cornice lines placed cleanly between window rows
      for (let r = 0; r < rows - 1; r++) {
        const fy = topY + 29.5 + r * 24;
        this.inkLine(ctx, x + 2, fy, x + bw - 2, fy, rng, {
          width: 0.75,
          alpha: 0.42,
          overshoot: 0.4,
        });
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = x + 8 + c * stepX + (stepX - 7.5) * 0.5;
          const wyPos = topY + 12 + r * 24;
          this.drawWindowUnit(ctx, wx, wyPos, 7.5, 11.5, rng() > 0.64, false, rng);
        }
      }

      const arches = bw > 104 ? 3 : 2;
      const aStep = (bw - 16) / arches;
      for (let a = 0; a < arches; a++) {
        const aw = Math.min(18, aStep * 0.62);
        const ah = 21;
        const ax = x + 8 + a * aStep + (aStep - aw) * 0.5;
        const ay = baseY - ah;
        ctx.fillStyle = p.heroRoof;
        ctx.beginPath();
        ctx.moveTo(ax, baseY);
        ctx.lineTo(ax, ay + aw * 0.5);
        ctx.arc(ax + aw * 0.5, ay + aw * 0.5, aw * 0.5, Math.PI, 0);
        ctx.lineTo(ax + aw, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = p.ink;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    } else if (type === "slender_spire") {
      const clkR = Math.min(7, bw * 0.24);
      ctx.fillStyle = p.windowBright;
      ctx.beginPath();
      ctx.arc(x + bw * 0.5, topY + 16, clkR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = p.ink;
      ctx.lineWidth = 1.15;
      ctx.stroke();

      const rows = Math.max(2, Math.floor((bh - 42) / 24));
      for (let r = 0; r < rows; r++) {
        const wyPos = topY + 32 + r * 24;
        const ww = 6.8;
        const wx = x + (bw - ww) * 0.5;
        this.drawWindowUnit(ctx, wx, wyPos, ww, 13, rng() > 0.58, true, rng);
      }
    } else if (type === "loft_studio") {
      const cols = bw > 74 ? 3 : 2;
      const rows = Math.max(2, Math.floor((bh - 24) / 30));
      const padX = 9;
      const stepX = (bw - padX * 2) / cols;

      for (let r = 0; r < rows; r++) {
        const wyPos = topY + 14 + r * 30;
        this.inkLine(ctx, x + 2, wyPos + 22, x + bw - 2, wyPos + 22, rng, {
          width: 0.75,
          alpha: 0.45,
          overshoot: 0.4,
        });
        for (let c = 0; c < cols; c++) {
          const ww = Math.min(16, stepX * 0.68);
          const wh = 17;
          const wx = x + padX + c * stepX + (stepX - ww) * 0.5;
          this.drawWindowUnit(ctx, wx, wyPos, ww, wh, rng() > 0.55, false, rng);
          this.inkLine(ctx, wx + ww * 0.5, wyPos, wx + ww * 0.5, wyPos + wh, rng, {
            width: 0.65,
            overshoot: 0,
          });
          this.inkLine(ctx, wx, wyPos + wh * 0.5, wx + ww, wyPos + wh * 0.5, rng, {
            width: 0.65,
            overshoot: 0,
          });
        }
      }
    } else if (type === "domed_hall") {
      this.inkLine(ctx, x + 2, topY + 10, x + bw - 2, topY + 10, rng, {
        width: 0.9,
        alpha: 0.65,
      });
      const cols = bw > 82 ? 4 : 3;
      const rows = Math.max(2, Math.floor((bh - 30) / 28));
      const padX = 10;
      const stepX = (bw - padX * 2) / cols;

      for (let r = 0; r < rows; r++) {
        const wyPos = topY + 18 + r * 28;
        for (let c = 0; c < cols; c++) {
          const ww = 8.2;
          const wh = 16;
          const wx = x + padX + c * stepX + (stepX - ww) * 0.5;
          this.drawWindowUnit(ctx, wx, wyPos, ww, wh, rng() > 0.6, true, rng);
        }
      }
    } else {
      const floorStep = 23 + rng() * 6;
      for (let fy = topY + floorStep; fy < baseY - 14; fy += floorStep) {
        if (rng() > 0.35) {
          this.inkLine(ctx, x + 2, fy, x + bw - 2, fy, rng, {
            width: 0.75,
            alpha: 0.5,
            overshoot: 0.6,
          });
        }
      }
      const cols = Math.max(2, Math.floor((bw - 10) / 13));
      const rows = Math.max(2, Math.floor((bh - 18) / 21));
      const padX = 7;
      const stepX = (bw - padX * 2) / cols;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = x + padX + c * stepX + (stepX - 6.5) * 0.5;
          const wyPos = topY + 14 + r * 20;
          this.drawWindowUnit(ctx, wx, wyPos, 6.2, 10.5, rng() > 0.66, false, rng);
        }
      }
    }

    if (rng() > 0.55) {
      const lx = x + bw * (0.2 + rng() * 0.6);
      const ly = baseY - 10 - rng() * 14;
      this.lanterns.push({
        x: lx,
        y: ly,
        r: 3.0,
        phase: rng() * Math.PI * 2,
        isBridge: false,
      });
    }

    return Math.min(topY - 6, roofPeakY + 8);
  }

  private drawWindowUnit(
    ctx: CanvasRenderingContext2D,
    wx: number,
    wyPos: number,
    ww: number,
    wh: number,
    isLit: boolean,
    arched: boolean,
    rng: Rng,
  ): void {
    const p = this.palette;
    if (isLit) {
      this.windows.push({
        x: wx,
        y: wyPos,
        w: ww,
        h: wh,
        arched,
        bright: rng() > 0.42,
        phase: rng() * Math.PI * 2,
        layer: "hero",
      });
    } else {
      ctx.fillStyle = p.isDark ? "rgba(6, 9, 14, 0.75)" : "rgba(28, 25, 23, 0.72)";
      if (arched) {
        ctx.beginPath();
        ctx.moveTo(wx, wyPos + wh);
        ctx.lineTo(wx, wyPos + ww * 0.5);
        ctx.arc(wx + ww * 0.5, wyPos + ww * 0.5, ww * 0.5, Math.PI, 0);
        ctx.lineTo(wx + ww, wyPos + wh);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(wx, wyPos, ww, wh);
      }
    }

    this.inkLine(ctx, wx - 1, wyPos + wh + 0.5, wx + ww + 1, wyPos + wh + 0.5, rng, {
      width: 1.0,
      overshoot: 0.7,
    });
    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 0.75;
    if (arched) {
      ctx.beginPath();
      ctx.moveTo(wx, wyPos + wh);
      ctx.lineTo(wx, wyPos + ww * 0.5);
      ctx.arc(wx + ww * 0.5, wyPos + ww * 0.5, ww * 0.5, Math.PI, 0);
      ctx.lineTo(wx + ww, wyPos + wh);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeRect(wx, wyPos, ww, wh);
    }
  }

  private drawQuayAndPilings(
    ctx: CanvasRenderingContext2D,
    w: number,
    wy: number,
    rng: Rng,
  ): number[] {
    const p = this.palette;
    const quayTop = wy - 14;
    const pilings: number[] = [];
    const walls: readonly [number, number][] = [
      [-SCENE_OVERSCAN_X, w * 0.385],
      [w * 0.615, w + SCENE_OVERSCAN_X],
    ];

    for (const [x1, x2] of walls) {
      ctx.fillStyle = p.heroRoof;
      ctx.fillRect(x1, quayTop, x2 - x1, 15);
      this.inkLine(ctx, x1, quayTop, x2, quayTop, rng, { width: 2.0, doublePass: true });
      this.inkLine(ctx, x1, wy, x2, wy, rng, { width: 1.6 });

      for (let px = x1 + 18; px < x2 - 14; px += 26 + rng() * 22) {
        if (rng() > 0.55) {
          const ph = 18 + rng() * 10;
          ctx.fillStyle = p.heroRoof;
          ctx.fillRect(px - 2.2, wy - ph + 6, 4.4, ph);
          this.inkLine(ctx, px - 2.2, wy - ph + 6, px - 2.2, wy + 6, rng, { width: 1.1 });
          this.inkLine(ctx, px + 2.2, wy - ph + 6, px + 2.2, wy + 6, rng, { width: 1.1 });
          pilings.push(px);
        }
      }
    }

    this.inkLine(ctx, -SCENE_OVERSCAN_X, wy, w + SCENE_OVERSCAN_X, wy, rng, {
      width: 1.35,
      alpha: 0.72,
      wobble: 0.6,
    });
    return pilings;
  }

  private drawStillInkWater(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    wy: number,
    pilings: readonly number[],
    rng: Rng,
  ): void {
    const p = this.palette;
    const waterH = h - wy;

    ctx.save();
    ctx.beginPath();
    ctx.rect(-SCENE_OVERSCAN_X, wy, w + SCENE_OVERSCAN_X * 2, waterH + SCENE_OVERSCAN_Y + 10);
    ctx.clip();

    const waterGrad = ctx.createLinearGradient(0, wy, 0, h + SCENE_OVERSCAN_Y);
    waterGrad.addColorStop(0, p.waterTop);
    waterGrad.addColorStop(0.5, p.waterMid);
    waterGrad.addColorStop(1, p.waterDeep);
    ctx.fillStyle = waterGrad;
    ctx.fillRect(-SCENE_OVERSCAN_X, wy, w + SCENE_OVERSCAN_X * 2, waterH + SCENE_OVERSCAN_Y + 10);

    const shoreShadow = ctx.createLinearGradient(0, wy, 0, wy + Math.min(46, waterH * 0.24));
    shoreShadow.addColorStop(0, p.waterShoreWash);
    shoreShadow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = shoreShadow;
    ctx.fillRect(-SCENE_OVERSCAN_X, wy, w + SCENE_OVERSCAN_X * 2, Math.min(46, waterH * 0.24));

    for (let i = 0; i < 8; i++) {
      const cx = rng() * w;
      const cy = wy + waterH * (0.15 + rng() * 0.7);
      const rx = w * (0.1 + rng() * 0.16);
      const ry = waterH * (0.07 + rng() * 0.12);
      this.drawWashCloud(ctx, cx, cy, rx, ry, p.waterPoolWash, rng);
    }

    const strokeCount = Math.round(w * 0.125);
    for (let i = 0; i < strokeCount; i++) {
      const depth = rng() ** 1.2;
      const sy = wy + 6 + depth * (waterH - 14);
      const sx = rng() * w;
      const len = (14 + rng() * 64) * (0.45 + depth * 1.15);

      const inBtnZone =
        sx + len * 0.5 > w * 0.38 &&
        sx + len * 0.5 < w * 0.62 &&
        sy > wy + waterH * 0.28 &&
        sy < wy + waterH * 0.72;
      if (inBtnZone && rng() > 0.2) continue;

      const isLight = rng() > 0.55;
      ctx.save();
      ctx.strokeStyle = isLight ? p.waterLightStroke : p.waterInkStroke;
      ctx.globalAlpha =
        (isLight ? 0.34 + rng() * 0.34 : 0.24 + rng() * 0.32) * (0.58 + (1 - depth) * 0.42);
      ctx.lineWidth = (0.7 + depth * 0.95) * (0.75 + rng() * 0.5);
      ctx.lineCap = "round";

      const waveH = (rng() - 0.5) * 2.1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(sx + len * 0.5, sy + waveH, sx + len, sy + (rng() - 0.5) * 0.9);
      ctx.stroke();
      ctx.restore();
    }

    for (const px of pilings) {
      ctx.save();
      ctx.strokeStyle = p.waterInkStroke;
      ctx.lineWidth = 0.85;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(px, wy + 7, 10 + rng() * 5, 2.2, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = p.waterLightStroke;
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.ellipse(px, wy + 8, 17 + rng() * 7, 3.6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const boatConfigs: BoatConfig[] = [
      { x: w * (0.24 + rng() * 0.06), y: wy + 10, scale: 1.0, flip: 1 },
      ...(w > 780
        ? [{ x: w * (0.76 + rng() * 0.06), y: wy + 12, scale: 0.84, flip: -1 as const }]
        : []),
    ];
    for (const b of boatConfigs) {
      this.drawStaticMooredBoat(ctx, b);
    }

    const btnY = wy + waterH * 0.54;
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = p.waterInkStroke;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, btnY + 8, 138, 22, 0, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();
    ctx.strokeStyle = p.waterLightStroke;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, btnY + 10, 168, 30, 0, 0.14 * Math.PI, 0.86 * Math.PI);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  private drawStaticMooredBoat(ctx: CanvasRenderingContext2D, boat: BoatConfig): void {
    const p = this.palette;
    ctx.save();
    ctx.translate(boat.x, boat.y);

    ctx.strokeStyle = p.waterInkStroke;
    ctx.lineWidth = 0.85;
    ctx.globalAlpha = 0.34;
    ctx.beginPath();
    ctx.ellipse(0, 4, 33 * boat.scale, 5.2 * boat.scale, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = p.waterLightStroke;
    ctx.globalAlpha = 0.26;
    ctx.beginPath();
    ctx.ellipse(0, 5, 46 * boat.scale, 7.6 * boat.scale, 0, 0.08 * Math.PI, 0.92 * Math.PI);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.scale(boat.flip * boat.scale, boat.scale);

    ctx.fillStyle = p.isDark ? "#090e15" : "#1b1918";
    ctx.beginPath();
    ctx.moveTo(-24, -4);
    ctx.quadraticCurveTo(-16, 5, 0, 5);
    ctx.quadraticCurveTo(18, 5, 27, -5);
    ctx.lineTo(18, -2);
    ctx.lineTo(-18, -2);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = p.ink;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(19, -3);
    ctx.lineTo(22, -13);
    ctx.stroke();

    const glow = ctx.createRadialGradient(22, -13, 0.5, 22, -13, 11);
    glow.addColorStop(0, p.windowBright);
    glow.addColorStop(0.4, p.lantern);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(22, -13, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  renderFrame(now: number): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return;

    const p = this.palette;
    const w = this.width;
    const h = this.height;
    const wy = this.waterY;

    let t = 0;
    let px = 0;
    let py = 0;

    if (!this.reducedMotion) {
      t = (now - this.startTime) * 0.001;
      this.pointer.x += (this.pointer.tx - this.pointer.x) * 0.045;
      this.pointer.y += (this.pointer.ty - this.pointer.y) * 0.045;
      px = (this.pointer.x - 0.5) * -7;
      py = (this.pointer.y - 0.5) * -2.8;
    }

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 1. Hand-Inked Cityscape + Still Ink-Wash Water
    ctx.save();
    ctx.translate(px * 0.4, py * 0.3);
    ctx.drawImage(
      this.upperSceneCanvas,
      -SCENE_OVERSCAN_X,
      -SCENE_OVERSCAN_Y,
      w + SCENE_OVERSCAN_X * 2,
      h + SCENE_OVERSCAN_Y * 2,
    );
    ctx.restore();

    // 2. Animated Chimney Smoke Wisps
    ctx.save();
    ctx.translate(px * 0.4, py * 0.3);
    for (const ch of this.chimneys) {
      for (let i = 0; i < 4; i++) {
        const cycle = (t * 0.22 + ch.phase + i * 0.25) % 1;
        const sx = ch.x + Math.sin(cycle * 5 + ch.phase) * 9 + cycle * 16;
        const sy = ch.y - cycle * 44;
        const sr = 3.5 + cycle * 12;
        ctx.fillStyle = p.smoke;
        ctx.globalAlpha = (1 - cycle) * 0.55;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 3. Warm Lit Windows & Hanging Lanterns (using pre-baked glow sprites)
    const winHalf = WINDOW_GLOW_SIZE / 2;
    const lanHalf = LANTERN_GLOW_SIZE / 2;

    ctx.save();
    ctx.translate(px * 0.4, py * 0.3);
    for (const win of this.windows) {
      const flicker =
        0.86 + Math.sin(t * 2.1 + win.phase) * 0.1 + Math.sin(t * 5.7 + win.phase * 2) * 0.04;
      ctx.fillStyle = win.bright ? p.windowBright : p.windowWarm;
      ctx.globalAlpha = (win.layer === "hero" ? 0.92 : 0.6) * flicker;
      if (win.arched) {
        ctx.beginPath();
        ctx.moveTo(win.x, win.y + win.h);
        ctx.lineTo(win.x, win.y + win.w * 0.5);
        ctx.arc(win.x + win.w * 0.5, win.y + win.w * 0.5, win.w * 0.5, Math.PI, 0);
        ctx.lineTo(win.x + win.w, win.y + win.h);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(win.x, win.y, win.w, win.h);
      }

      if (win.layer === "hero" && win.bright) {
        ctx.globalAlpha = 0.24 * flicker;
        ctx.drawImage(
          this.windowGlowCanvas,
          win.x + win.w * 0.5 - winHalf,
          win.y + win.h * 0.5 - winHalf,
          WINDOW_GLOW_SIZE,
          WINDOW_GLOW_SIZE,
        );
      }
    }

    for (const lan of this.lanterns) {
      const sway = Math.sin(t * 1.4 + lan.phase) * (lan.isBridge ? 0.5 : 1.6);
      const lx = lan.x + sway;
      const ly = lan.y;

      ctx.globalAlpha = 0.54 + Math.sin(t * 2.8 + lan.phase) * 0.1;
      ctx.drawImage(
        this.lanternGlowCanvas,
        lx - lanHalf,
        ly - lanHalf,
        LANTERN_GLOW_SIZE,
        LANTERN_GLOW_SIZE,
      );

      ctx.globalAlpha = 0.96;
      ctx.fillStyle = p.lantern;
      ctx.beginPath();
      ctx.ellipse(lx, ly, lan.r * 0.85, lan.r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 4. Floating Atmospheric Lantern Motes (upper air only)
    ctx.save();
    for (const m of this.motes) {
      const mx = (m.x + t * m.vx + Math.sin(t * 0.8 + m.phase) * 12 + w) % w;
      const my = (((m.y + t * m.vy) % (wy - 10)) + (wy - 10)) % (wy - 10);
      const alpha = 0.22 + 0.32 * Math.sin(t * 1.9 + m.phase);
      ctx.fillStyle = p.mote;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.beginPath();
      ctx.arc(mx, my, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore();
  }
}
