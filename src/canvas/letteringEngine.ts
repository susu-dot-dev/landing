import { LETTERING_PALETTES, type LetteringPalette, type RgbTuple } from "./palettes";
import { createRng, type Rng } from "./prng";
import type { LetteringController, LetteringOptions, PaletteKey, ShadingMedium } from "./types";

type StrokePassKind =
  | "marker-main"
  | "marker-glaze"
  | "hatch-main"
  | "hatch-shadow"
  | "pencil-main"
  | "pencil-burnish";

interface GlyphData {
  index: number;
  char: string;
  x: number;
  centerX: number;
  baselineY: number;
  rot: number;
  wobbleX: number;
  wobbleY: number;
  width: number;
  boxX: number;
  boxY: number;
  boxW: number;
  boxH: number;
  pad: number;
  maskCanvas: HTMLCanvasElement;
  hiMaskCanvas: HTMLCanvasElement;
  colorCanvas: HTMLCanvasElement;
  colorCtx: CanvasRenderingContext2D;
}

interface RawSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  band: number;
  passKind: StrokePassKind;
}

interface PlannedStroke {
  glyphIndex: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
  len: number;
  passKind: StrokePassKind;
  seed: number;
}

interface Point {
  x: number;
  y: number;
}

const OUTLINE_DURATION = 750;
const SHADE_DELAY = 520;
const SHADE_DURATION = 7200;
const NIB_FADE_DURATION = 420;

function lerpRgb(a: RgbTuple, b: RgbTuple, f: number): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

export class IllustratorLettering implements LetteringController {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private text: string;
  private paletteKey: PaletteKey;
  private medium: ShadingMedium;
  private reducedMotion: boolean;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private fontSize = 54;
  private fontStr = "";

  private readonly shadeCanvas: HTMLCanvasElement;

  private glyphs: GlyphData[] = [];
  private strokes: PlannedStroke[] = [];
  private totalStrokeLen = 0;

  private animStart = 0;
  private drawnLen = 0;
  private strokeCursor = 0;
  private strokeSegOffset = 0;
  private activeTip: Point | null = null;
  private isComplete = false;
  private rafId: number | null = null;
  private disposed = false;

  private readonly tick: (now: number) => void;

  constructor(canvas: HTMLCanvasElement, opts: LetteringOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.text = opts.text ?? "susu.dev";
    this.paletteKey = opts.palette ?? "sumi";
    this.medium = opts.medium ?? "marker";
    this.reducedMotion = opts.reducedMotion ?? false;

    this.shadeCanvas = document.createElement("canvas");

    this.tick = (now: number) => {
      this.rafId = null;
      if (this.disposed || this.reducedMotion) return;
      const shouldContinue = this.renderFrame(now);
      if (shouldContinue) {
        this.rafId = requestAnimationFrame(this.tick);
      }
    };

    if (this.ctx) {
      this.updateCanvasSize();
      const fontsReady = document.fonts?.ready;
      if (fontsReady) {
        void fontsReady.then(() => {
          if (this.disposed) return;
          this.prepareGlyphs();
          this.replay();
        });
      } else {
        this.prepareGlyphs();
        this.replay();
      }
    }
  }

  private get palette(): LetteringPalette {
    return LETTERING_PALETTES[this.paletteKey];
  }

  private cancelLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private releaseGlyphCanvases(): void {
    for (const g of this.glyphs) {
      g.maskCanvas.width = 0;
      g.maskCanvas.height = 0;
      g.hiMaskCanvas.width = 0;
      g.hiMaskCanvas.height = 0;
      g.colorCanvas.width = 0;
      g.colorCanvas.height = 0;
    }
    this.glyphs = [];
  }

  setPalette(key: PaletteKey): void {
    if (this.disposed || !this.ctx) return;
    this.paletteKey = key;
    this.replay();
  }

  setMedium(medium: ShadingMedium): void {
    if (this.disposed || !this.ctx) return;
    this.medium = medium;
    this.prepareGlyphs();
    this.replay();
  }

  setText(text: string): void {
    if (this.disposed || !this.ctx) return;
    if (text === this.text) {
      this.replay();
      return;
    }
    this.text = text;
    const apply = () => {
      if (this.disposed || this.text !== text) return;
      this.prepareGlyphs();
      this.replay();
    };
    const fonts = document.fonts;
    if (fonts?.load) {
      // Canvas text does not trigger web font loads, so request the glyphs explicitly.
      void fonts.load(this.getFontString(this.fontSize), text).then(apply, apply);
    } else {
      apply();
    }
  }

  setReducedMotion(reduced: boolean): void {
    if (this.disposed || !this.ctx) return;
    this.reducedMotion = reduced;
    this.replay();
  }

  resize(opts: { replay?: boolean } = {}): boolean {
    if (this.disposed || !this.ctx) return false;
    const prevWidth = this.width;
    const prevHeight = this.height;
    const prevDpr = this.dpr;
    this.updateCanvasSize();
    if (
      this.glyphs.length > 0 &&
      this.width === prevWidth &&
      this.height === prevHeight &&
      this.dpr === prevDpr
    ) {
      return false;
    }
    this.prepareGlyphs();
    if (opts.replay === false) {
      this.showCompleted();
    } else {
      this.replay();
    }
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoop();
    this.releaseGlyphCanvases();
    this.strokes = [];
    this.shadeCanvas.width = 0;
    this.shadeCanvas.height = 0;
  }

  private updateCanvasSize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(300, Math.round(rect.width || 800));
    this.height = Math.max(120, Math.round(rect.height || 220));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);

    this.shadeCanvas.width = this.canvas.width;
    this.shadeCanvas.height = this.canvas.height;
  }

  private getFontString(size: number): string {
    return `900 ${size}px 'Fraunces', 'Noto Serif Display', 'URW Bookman', 'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif CJK JP', 'Songti SC', 'PMingLiU', Georgia, serif`;
  }

  private prepareGlyphs(): void {
    this.releaseGlyphCanvases();

    const w = this.width;
    const h = this.height;
    const chars = Array.from(this.text);
    const rng = createRng(4041);

    let fontSize = Math.min(h * 0.68, w * 0.175, 152);
    fontSize = Math.max(54, Math.round(fontSize));

    const measureCanvas = document.createElement("canvas");
    const mCtx = measureCanvas.getContext("2d") as CanvasRenderingContext2D;
    mCtx.font = this.getFontString(fontSize);

    const letterSpacing = fontSize * 0.045;
    const rawWidths = chars.map((ch) => mCtx.measureText(ch).width);
    let totalW = rawWidths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
    if (totalW > w * 0.88) {
      const scale = (w * 0.88) / totalW;
      fontSize = Math.max(44, Math.floor(fontSize * scale));
      mCtx.font = this.getFontString(fontSize);
    }

    const fontStr = this.getFontString(fontSize);
    const spacing = fontSize * 0.045;
    const widths = chars.map((ch) => mCtx.measureText(ch).width);
    totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);

    measureCanvas.width = 0;
    measureCanvas.height = 0;

    const startX = (w - totalW) * 0.5;
    const baselineY = h * 0.67;

    this.fontSize = fontSize;
    this.fontStr = fontStr;
    this.strokes = [];
    this.totalStrokeLen = 0;

    let cursorX = startX;
    chars.forEach((ch, idx) => {
      const gw = widths[idx] as number;
      const yJitter = ch === "." ? 0 : (rng() - 0.5) * 4.5;
      const rot = ch === "." ? 0 : (rng() - 0.5) * 0.032;
      const wobbleX = (rng() - 0.5) * 0.9;
      const wobbleY = (rng() - 0.5) * 0.9;

      const pad = Math.ceil(fontSize * 0.24);
      const boxW = Math.ceil(gw + pad * 2);
      const boxH = Math.ceil(fontSize * 1.45);
      const boxX = Math.floor(cursorX - pad);
      const boxY = Math.floor(baselineY - fontSize * 0.98 + yJitter);

      const maskCanvas = document.createElement("canvas");
      maskCanvas.width = boxW;
      maskCanvas.height = boxH;
      const maskCtx = maskCanvas.getContext("2d") as CanvasRenderingContext2D;
      maskCtx.save();
      maskCtx.translate(pad + gw * 0.5, fontSize * 0.98);
      maskCtx.rotate(rot);
      maskCtx.font = fontStr;
      maskCtx.textBaseline = "alphabetic";
      maskCtx.textAlign = "center";
      maskCtx.fillStyle = "#000";
      maskCtx.fillText(ch, 0, 0);
      maskCtx.restore();

      const hiMaskCanvas = document.createElement("canvas");
      hiMaskCanvas.width = Math.round(boxW * this.dpr);
      hiMaskCanvas.height = Math.round(boxH * this.dpr);
      const hiMaskCtx = hiMaskCanvas.getContext("2d") as CanvasRenderingContext2D;
      hiMaskCtx.save();
      hiMaskCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      hiMaskCtx.translate(pad + gw * 0.5, fontSize * 0.98);
      hiMaskCtx.rotate(rot);
      hiMaskCtx.font = fontStr;
      hiMaskCtx.textBaseline = "alphabetic";
      hiMaskCtx.textAlign = "center";
      hiMaskCtx.fillStyle = "#000";
      hiMaskCtx.fillText(ch, 0, 0);
      hiMaskCtx.restore();

      const colorCanvas = document.createElement("canvas");
      colorCanvas.width = hiMaskCanvas.width;
      colorCanvas.height = hiMaskCanvas.height;
      const colorCtx = colorCanvas.getContext("2d") as CanvasRenderingContext2D;

      const glyph: GlyphData = {
        index: idx,
        char: ch,
        x: cursorX,
        centerX: cursorX + gw * 0.5,
        baselineY: baselineY + yJitter,
        rot,
        wobbleX,
        wobbleY,
        width: gw,
        boxX,
        boxY,
        boxW,
        boxH,
        pad,
        maskCanvas,
        hiMaskCanvas,
        colorCanvas,
        colorCtx,
      };
      this.glyphs.push(glyph);

      const glyphStrokes = this.planGlyphStrokes(glyph, rng);
      for (const st of glyphStrokes) {
        this.strokes.push(st);
        this.totalStrokeLen += st.len;
      }

      cursorX += gw + spacing;
    });
  }

  private planGlyphStrokes(glyph: GlyphData, rng: Rng): PlannedStroke[] {
    const { boxW, boxH, maskCanvas } = glyph;
    const maskCtx = maskCanvas.getContext("2d") as CanvasRenderingContext2D;
    const imgData = maskCtx.getImageData(0, 0, boxW, boxH).data;

    const isInside = (x: number, y: number): boolean => {
      const ix = Math.round(x);
      const iy = Math.round(y);
      if (ix < 0 || iy < 0 || ix >= boxW || iy >= boxH) return false;
      return (imgData[(iy * boxW + ix) * 4 + 3] as number) > 110;
    };

    const scanAngle = (
      angleRad: number,
      spacing: number,
      passKind: StrokePassKind,
    ): PlannedStroke[] => {
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const px = -sin;
      const py = cos;
      const cx = boxW * 0.5;
      const cy = boxH * 0.5;
      const diag = Math.hypot(boxW, boxH);

      const rawSegs: RawSegment[] = [];
      let bandIdx = 0;

      for (let d = -diag * 0.55; d <= diag * 0.55; d += spacing) {
        const ox = cx + px * d;
        const oy = cy + py * d;
        let inRun = false;
        let sx = 0;
        let sy = 0;
        let lastX = 0;
        let lastY = 0;

        for (let s = -diag * 0.55; s <= diag * 0.55; s += 2) {
          const x = ox + cos * s;
          const y = oy + sin * s;
          const inside = isInside(x, y);
          if (inside && !inRun) {
            inRun = true;
            sx = x;
            sy = y;
            lastX = x;
            lastY = y;
          } else if (inside) {
            lastX = x;
            lastY = y;
          } else if (inRun) {
            inRun = false;
            const segLen = Math.hypot(lastX - sx, lastY - sy);
            if (segLen >= 2.5) {
              rawSegs.push({
                x1: sx,
                y1: sy,
                x2: lastX,
                y2: lastY,
                band: bandIdx,
                passKind,
              });
            }
          }
        }
        bandIdx++;
      }

      if (rawSegs.length === 0) return [];

      const ordered: RawSegment[] = [];
      const used = new Uint8Array(rawSegs.length);

      let currentIdx = 0;
      let bestScore = Number.POSITIVE_INFINITY;
      for (let i = 0; i < rawSegs.length; i++) {
        const seg = rawSegs[i] as RawSegment;
        const sc = seg.y1 * 1.15 + seg.x1;
        if (sc < bestScore) {
          bestScore = sc;
          currentIdx = i;
        }
      }

      const first = rawSegs[currentIdx] as RawSegment;
      used[currentIdx] = 1;
      let tipX = first.x2;
      let tipY = first.y2;
      let curBand = first.band;
      ordered.push(first);

      for (let step = 1; step < rawSegs.length; step++) {
        let nextIdx = 0;
        let flip = false;
        let minCost = Number.POSITIVE_INFINITY;

        for (let i = 0; i < rawSegs.length; i++) {
          if (used[i]) continue;
          const seg = rawSegs[i] as RawSegment;
          const bandDelta = Math.abs(seg.band - curBand);
          const bandPenalty = bandDelta <= 2 ? 0 : bandDelta * 14;

          const d1 = Math.hypot(seg.x1 - tipX, seg.y1 - tipY) + bandPenalty;
          const d2 = Math.hypot(seg.x2 - tipX, seg.y2 - tipY) + bandPenalty;

          if (d1 < minCost) {
            minCost = d1;
            nextIdx = i;
            flip = false;
          }
          if (d2 < minCost) {
            minCost = d2;
            nextIdx = i;
            flip = true;
          }
        }

        used[nextIdx] = 1;
        const chosen = rawSegs[nextIdx] as RawSegment;
        const seg: RawSegment = flip
          ? { ...chosen, x1: chosen.x2, y1: chosen.y2, x2: chosen.x1, y2: chosen.y1 }
          : { ...chosen };

        const dx = seg.x2 - seg.x1;
        const dy = seg.y2 - seg.y1;
        const l = Math.hypot(dx, dy);
        const ux = dx / l;
        const uy = dy / l;
        seg.x1 -= ux * 2.5;
        seg.y1 -= uy * 2.5;
        seg.x2 += ux * 2.5;
        seg.y2 += uy * 2.5;

        tipX = seg.x2;
        tipY = seg.y2;
        curBand = seg.band;
        ordered.push(seg);
      }

      return ordered.map((s) => {
        const len = Math.max(4, Math.hypot(s.x2 - s.x1, s.y2 - s.y1));
        const midX = (s.x1 + s.x2) * 0.5 + (rng() - 0.5) * 3.2;
        const midY = (s.y1 + s.y2) * 0.5 + (rng() - 0.5) * 3.2;
        return {
          glyphIndex: glyph.index,
          x1: s.x1,
          y1: s.y1,
          cx: midX,
          cy: midY,
          x2: s.x2,
          y2: s.y2,
          len,
          passKind: s.passKind,
          seed: rng() * 1000,
        };
      });
    };

    if (this.medium === "hatch") {
      const primary = scanAngle(-0.68, Math.max(4.4, this.fontSize * 0.044), "hatch-main");
      const shadow = scanAngle(0.55, Math.max(6.2, this.fontSize * 0.062), "hatch-shadow").filter(
        (s) => (s.y1 + s.y2) * 0.5 > boxH * 0.48,
      );
      return [...primary, ...shadow];
    }

    if (this.medium === "pencil") {
      const base = scanAngle(-0.62, Math.max(3.6, this.fontSize * 0.036), "pencil-main");
      const accent = scanAngle(-0.56, Math.max(6.0, this.fontSize * 0.06), "pencil-burnish").filter(
        (s) => (s.y1 + s.y2) * 0.5 > boxH * 0.44,
      );
      return [...base, ...accent];
    }

    const spacing = Math.max(5.2, this.fontSize * 0.056);
    const mainPass = scanAngle(-0.64, spacing, "marker-main");
    const glazePass = scanAngle(-0.58, spacing * 1.35, "marker-glaze").filter(
      (s) => (s.y1 + s.y2) * 0.5 > boxH * 0.56,
    );
    return [...mainPass, ...glazePass];
  }

  /** Synchronously draws the finished lettering (no write-on animation, no nib). */
  private showCompleted(): void {
    this.cancelLoop();
    this.animStart = performance.now();
    this.drawnLen = 0;
    this.strokeCursor = 0;
    this.strokeSegOffset = 0;
    this.activeTip = null;
    for (const g of this.glyphs) {
      g.colorCtx.setTransform(1, 0, 0, 1, 0, 0);
      g.colorCtx.clearRect(0, 0, g.colorCanvas.width, g.colorCanvas.height);
    }
    this.advanceShading(this.totalStrokeLen);
    this.isComplete = true;
    this.activeTip = null;
    this.renderFrame(this.animStart + SHADE_DELAY + SHADE_DURATION + NIB_FADE_DURATION + 1);
  }

  replay(): void {
    if (this.disposed || !this.ctx) return;
    this.cancelLoop();

    this.animStart = performance.now();
    this.drawnLen = 0;
    this.strokeCursor = 0;
    this.strokeSegOffset = 0;
    this.activeTip = null;
    this.isComplete = false;

    for (const g of this.glyphs) {
      g.colorCtx.setTransform(1, 0, 0, 1, 0, 0);
      g.colorCtx.clearRect(0, 0, g.colorCanvas.width, g.colorCanvas.height);
    }

    if (this.reducedMotion) {
      this.showCompleted();
      return;
    }

    this.rafId = requestAnimationFrame(this.tick);
  }

  private sampleQuad(st: PlannedStroke, t: number): Point {
    const mt = 1 - t;
    return {
      x: mt * mt * st.x1 + 2 * mt * t * st.cx + t * t * st.x2,
      y: mt * mt * st.y1 + 2 * mt * t * st.cy + t * t * st.y2,
    };
  }

  private paintStrokeSlice(st: PlannedStroke, t0: number, t1: number): void {
    const glyph = this.glyphs[st.glyphIndex] as GlyphData;
    const ctx = glyph.colorCtx;
    const p = this.palette;

    const yNorm = Math.max(
      0,
      Math.min(1, ((st.y1 + st.y2) * 0.5 - glyph.boxH * 0.2) / (glyph.boxH * 0.65)),
    );

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (st.passKind === "marker-main" || st.passKind === "marker-glaze") {
      const [r, g, b] = lerpRgb(p.markerTop, p.markerBot, yNorm);
      const baseW = Math.max(6.8, this.fontSize * 0.086);
      const steps = Math.max(3, Math.ceil(((t1 - t0) * st.len) / 2.2));
      const isGlaze = st.passKind === "marker-glaze";

      for (let i = 0; i < steps; i++) {
        const ta = t0 + ((t1 - t0) * i) / steps;
        const tb = t0 + ((t1 - t0) * (i + 1)) / steps;
        const pa = this.sampleQuad(st, ta);
        const pb = this.sampleQuad(st, tb);

        const edgePool = (Math.abs(ta - 0.5) * 2) ** 2.2 * 0.14;
        const alpha = (isGlaze ? 0.24 : 0.44) + edgePool;

        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = isGlaze ? baseW * 0.8 : baseW;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();

        const bristleOff = Math.sin(st.seed + ta * 9) * (baseW * 0.22);
        ctx.strokeStyle = `rgba(${Math.max(0, r - 24)}, ${Math.max(0, g - 18)}, ${Math.max(0, b - 14)}, ${(alpha * 0.45).toFixed(3)})`;
        ctx.lineWidth = Math.max(1.2, baseW * 0.24);
        ctx.beginPath();
        ctx.moveTo(pa.x + bristleOff, pa.y - bristleOff * 0.4);
        ctx.lineTo(pb.x + bristleOff, pb.y - bristleOff * 0.4);
        ctx.stroke();
      }
    } else if (st.passKind === "hatch-main" || st.passKind === "hatch-shadow") {
      const isShadow = st.passKind === "hatch-shadow";
      const steps = Math.max(2, Math.ceil(((t1 - t0) * st.len) / 3.5));
      ctx.strokeStyle = isShadow ? p.hatchShadow : p.hatchPrimary;
      ctx.lineWidth = isShadow ? 1.15 : Math.max(1.5, this.fontSize * 0.017);
      ctx.lineCap = "round";
      ctx.beginPath();
      const p0 = this.sampleQuad(st, t0);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i <= steps; i++) {
        const ti = t0 + ((t1 - t0) * i) / steps;
        const pt = this.sampleQuad(st, ti);
        const j = Math.sin(st.seed + ti * 14) * 0.65;
        ctx.lineTo(pt.x + j, pt.y - j);
      }
      ctx.stroke();
    } else {
      const [r, g, b] = lerpRgb(p.pencilTop, p.pencilBot, yNorm);
      const isBurnish = st.passKind === "pencil-burnish";
      const w = Math.max(4.5, this.fontSize * 0.056);
      const steps = Math.max(4, Math.ceil(((t1 - t0) * st.len) / 1.4));

      for (let i = 0; i <= steps; i++) {
        const ti = t0 + ((t1 - t0) * i) / steps;
        const pt = this.sampleQuad(st, ti);
        for (let gIdx = 0; gIdx < 7; gIdx++) {
          const hash =
            Math.sin(pt.x * 12.9898 + pt.y * 78.233 + gIdx * 37.7 + st.seed) * 43758.5453;
          const frac = hash - Math.floor(hash);
          if (frac < 0.24) continue;
          const offX = Math.sin(gIdx * 2.4 + st.seed) * 0.5 * w;
          const offY = Math.cos(gIdx * 3.1 + ti * 11) * 0.5 * w;
          const rad = 0.8 + frac * 1.45;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${(isBurnish ? 0.34 : 0.48) * frac})`;
          ctx.fillRect(pt.x + offX, pt.y + offY, rad, rad);
        }
      }
    }

    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(glyph.hiMaskCanvas, 0, 0, glyph.boxW, glyph.boxH);
    ctx.restore();
  }

  private advanceShading(targetLen: number): void {
    while (this.strokeCursor < this.strokes.length && this.drawnLen < targetLen) {
      const st = this.strokes[this.strokeCursor] as PlannedStroke;
      const remainingInSeg = st.len - this.strokeSegOffset;
      const budget = targetLen - this.drawnLen;

      const stepLen = Math.min(remainingInSeg, budget);
      const t0 = this.strokeSegOffset / st.len;
      const t1 = (this.strokeSegOffset + stepLen) / st.len;

      this.paintStrokeSlice(st, t0, t1);

      const glyph = this.glyphs[st.glyphIndex] as GlyphData;
      const localTip = this.sampleQuad(st, t1);
      this.activeTip = {
        x: glyph.boxX + localTip.x,
        y: glyph.boxY + localTip.y,
      };

      this.drawnLen += stepLen;
      this.strokeSegOffset += stepLen;

      if (this.strokeSegOffset >= st.len - 0.001) {
        this.strokeCursor++;
        this.strokeSegOffset = 0;
      }
    }

    if (this.strokeCursor >= this.strokes.length) {
      this.isComplete = true;
    }
  }

  private drawHandInkedBacking(ctx: CanvasRenderingContext2D, outlineProgress: number): void {
    const p = this.palette;
    const count = this.glyphs.length;

    for (let i = 0; i < count; i++) {
      const g = this.glyphs[i] as GlyphData;
      const startT = (i / count) * 0.65;
      const localP = Math.max(0, Math.min(1, (outlineProgress - startT) / 0.35));
      if (localP <= 0) continue;

      ctx.save();
      ctx.translate(g.centerX, g.baselineY);
      ctx.rotate(g.rot);
      ctx.font = this.fontStr;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
      ctx.globalAlpha = localP * 0.42;
      ctx.fillStyle = p.paperUnder;
      ctx.fillText(g.char, 0, 0);
      ctx.restore();
    }
  }

  private drawHandInkedOutlines(ctx: CanvasRenderingContext2D, outlineProgress: number): void {
    const p = this.palette;
    const count = this.glyphs.length;

    for (let i = 0; i < count; i++) {
      const g = this.glyphs[i] as GlyphData;
      const startT = (i / count) * 0.65;
      const localP = Math.max(0, Math.min(1, (outlineProgress - startT) / 0.35));
      if (localP <= 0) continue;

      ctx.save();
      ctx.translate(g.centerX, g.baselineY);
      ctx.rotate(g.rot);
      ctx.font = this.fontStr;
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // Secondary delicate dip-pen sketch ghost contour with baked organic wobble
      ctx.globalAlpha = localP * 0.55;
      ctx.strokeStyle = p.outlineGhost;
      ctx.lineWidth = Math.max(1.2, this.fontSize * 0.014);
      ctx.strokeText(g.char, 1.0 + g.wobbleX, -0.7 + g.wobbleY);

      // Subtle organic dip-pen bleed pass (replaces live SVG turbulence filter)
      ctx.globalAlpha = localP * 0.32;
      ctx.strokeStyle = p.outline;
      ctx.lineWidth = Math.max(1.6, this.fontSize * 0.02);
      ctx.strokeText(g.char, -g.wobbleX * 0.6, g.wobbleY * 0.6);

      // Crisp primary dark hand-inked outline ON TOP of the shading
      ctx.globalAlpha = localP;
      ctx.strokeStyle = p.outline;
      ctx.lineWidth = Math.max(2.2, this.fontSize * 0.026);
      ctx.strokeText(g.char, 0, 0);

      ctx.restore();
    }
  }

  private drawActiveNib(ctx: CanvasRenderingContext2D, tip: Point, fade: number): void {
    const p = this.palette;
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.globalAlpha = fade * 0.85;
    ctx.rotate(-0.62);

    ctx.fillStyle = p.nibAccent;
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = p.nibColor;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(14, -5.5);
    ctx.lineTo(24, -1.5);
    ctx.lineTo(12, 4.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = p.nibAccent;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(2, 0);
    ctx.lineTo(13, -0.5);
    ctx.stroke();

    ctx.restore();
  }

  renderFrame(now: number): boolean {
    const ctx = this.ctx;
    if (!ctx || this.disposed) return false;

    const elapsed = now - this.animStart;
    const w = this.width;
    const h = this.height;

    const outlineP = Math.max(0, Math.min(1, elapsed / OUTLINE_DURATION));

    let shadeP = 0;
    if (elapsed > SHADE_DELAY) {
      const raw = Math.min(1, (elapsed - SHADE_DELAY) / SHADE_DURATION);
      shadeP = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2;
    }

    const targetLen = shadeP >= 1 ? Number.POSITIVE_INFINITY : shadeP * this.totalStrokeLen;
    if (!this.isComplete && (targetLen > this.drawnLen || shadeP >= 1)) {
      this.advanceShading(targetLen);
    }

    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.drawHandInkedBacking(ctx, outlineP);

    for (const g of this.glyphs) {
      ctx.drawImage(g.colorCanvas, g.boxX, g.boxY, g.boxW, g.boxH);
    }

    this.drawHandInkedOutlines(ctx, outlineP);

    let nibFade = 0;
    if (!this.reducedMotion && elapsed > SHADE_DELAY) {
      const doneElapsed = Math.max(0, elapsed - (SHADE_DELAY + SHADE_DURATION));
      nibFade = Math.max(0, 1 - doneElapsed / NIB_FADE_DURATION);
      if (this.activeTip && nibFade > 0.01) {
        this.drawActiveNib(ctx, this.activeTip, nibFade);
      }
    }

    ctx.restore();

    return !(this.isComplete && nibFade <= 0);
  }
}
