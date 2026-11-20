import { useCallback, useEffect, useRef, useState } from "react";
import { IllustratorLettering, InkCityscape } from "@/canvas";
import { LoginDialog } from "./LoginDialog";
import {
  type CityscapeController,
  type CityscapeFactory,
  type LetteringController,
  type LetteringFactory,
  PALETTE_KEYS,
  type PaletteKey,
  type ShadingMedium,
} from "./types";

const PALETTE_STORAGE_KEY = "susu-palette";
const DEFAULT_REDRAW_INTERVAL_MS = 30_000;

function isPaletteKey(value: string | null | undefined): value is PaletteKey {
  return value === "sumi" || value === "twilight" || value === "nocturne";
}

export function pickNextPalette(random: () => number = Math.random): PaletteKey {
  let previous: string | null = null;
  try {
    previous = window.sessionStorage.getItem(PALETTE_STORAGE_KEY);
  } catch {
    previous = null;
  }

  const candidates = PALETTE_KEYS.filter((key) => key !== previous);
  const index = Math.floor(random() * candidates.length);
  const next = candidates[index] ?? "sumi";

  try {
    window.sessionStorage.setItem(PALETTE_STORAGE_KEY, next);
  } catch {
    // Ignore storage failures in restricted browsing contexts.
  }

  return next;
}

export function resolveInitialPalette(
  explicit?: PaletteKey,
  random: () => number = Math.random,
): PaletteKey {
  if (explicit) return explicit;
  const bootPalette = document.documentElement.dataset.palette;
  if (isPaletteKey(bootPalette)) {
    delete document.documentElement.dataset.palette;
    return bootPalette;
  }
  return pickNextPalette(random);
}

const defaultCreateCityscape: CityscapeFactory = (canvas, options) =>
  new InkCityscape(canvas, options);

const defaultCreateLettering: LetteringFactory = (canvas, options) =>
  new IllustratorLettering(canvas, options);

export interface LandingStageProps {
  createCityscape?: CityscapeFactory;
  createLettering?: LetteringFactory;
  initialPalette?: PaletteKey;
  initialMedium?: ShadingMedium;
  redrawIntervalMs?: number;
}

export function LandingStage({
  createCityscape = defaultCreateCityscape,
  createLettering = defaultCreateLettering,
  initialPalette,
  initialMedium = "marker",
  redrawIntervalMs = DEFAULT_REDRAW_INTERVAL_MS,
}: LandingStageProps) {
  const [palette] = useState<PaletteKey>(() => resolveInitialPalette(initialPalette));
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const cityscapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const letteringCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loginTriggerRef = useRef<HTMLButtonElement | null>(null);

  const cityscapeRef = useRef<CityscapeController | null>(null);
  const letteringRef = useRef<LetteringController | null>(null);
  const isLoginOpenRef = useRef(isLoginOpen);

  useEffect(() => {
    const cityscapeCanvas = cityscapeCanvasRef.current as HTMLCanvasElement;
    const letteringCanvas = letteringCanvasRef.current as HTMLCanvasElement;
    const stageElement = stageRef.current as HTMLDivElement;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;

    const cityscape = createCityscape(cityscapeCanvas, {
      palette,
      reducedMotion,
    });

    const lettering = createLettering(letteringCanvas, {
      text: "susu.dev",
      palette,
      medium: initialMedium,
      reducedMotion,
    });

    cityscapeRef.current = cityscape;
    letteringRef.current = lettering;

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
      reducedMotion = event.matches;
      cityscape.setReducedMotion(event.matches);
      lettering.setReducedMotion(event.matches);
    };
    reducedMotionQuery.addEventListener("change", handleReducedMotionChange);

    const handlePointerMove = (event: PointerEvent) => {
      cityscape.handlePointerMove(event.clientX, event.clientY);
    };
    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    const handleResize = () => {
      cityscape.resize();
      lettering.resize();
    };

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(stageElement);
    } else {
      window.addEventListener("resize", handleResize);
    }

    const redrawTimer = window.setInterval(() => {
      if (!document.hidden && !reducedMotion && !isLoginOpenRef.current) {
        cityscape.regenerate();
      }
    }, redrawIntervalMs);

    return () => {
      window.clearInterval(redrawTimer);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener("resize", handleResize);
      }
      window.removeEventListener("pointermove", handlePointerMove);
      reducedMotionQuery.removeEventListener("change", handleReducedMotionChange);
      cityscape.dispose();
      lettering.dispose();
      cityscapeRef.current = null;
      letteringRef.current = null;
    };
  }, [createCityscape, createLettering, initialMedium, palette, redrawIntervalMs]);

  useEffect(() => {
    isLoginOpenRef.current = isLoginOpen;
    (cityscapeRef.current as CityscapeController).setPaused(isLoginOpen);
  }, [isLoginOpen]);

  const handleReplayLettering = useCallback(() => {
    (letteringRef.current as LetteringController).replay();
  }, []);

  const handleOpenLogin = useCallback(() => {
    setIsLoginOpen(true);
  }, []);

  const handleCloseLogin = useCallback(() => {
    setIsLoginOpen(false);
  }, []);

  return (
    <div ref={stageRef} className="landing-stage" data-palette={palette}>
      {/* Hidden SVG filter definition for the static hand-inked button frame */}
      <svg className="svg-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter id="ink-button-wobble" x="-8%" y="-12%" width="116%" height="124%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.035"
              numOctaves="2"
              seed="5"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="1.6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div className="landing-poster" aria-hidden="true" />
      <canvas
        ref={cityscapeCanvasRef}
        className="landing-cityscape"
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="landing-paper-overlay" aria-hidden="true" />

      <main className="landing-stage-content">
        {/* Sky zone: susu.dev hand-inked lettering floating in open sky */}
        <div className="sky-title-zone">
          <h1 className="sr-only">susu.dev</h1>
          <div className="sky-title-inner">
            <canvas
              ref={letteringCanvasRef}
              className="landing-lettering-canvas"
              aria-hidden="true"
              tabIndex={-1}
            />
            <button
              type="button"
              className="landing-replay-trigger"
              aria-label="Replay susu.dev title shading"
              onClick={handleReplayLettering}
            />
          </div>
        </div>

        {/* Water zone: Floating hand-inked Login button */}
        <div className="water-action-zone">
          <div className="water-login-wrap">
            <button
              ref={loginTriggerRef}
              type="button"
              className="water-login-btn"
              aria-haspopup="dialog"
              onClick={handleOpenLogin}
            >
              <svg
                className="btn-ink-frame"
                viewBox="0 0 240 68"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path
                  className="frame-outer"
                  d="M 22 10 C 70 8, 170 8, 218 10 C 228 11, 232 21, 232 34 C 232 47, 228 57, 218 58 C 170 60, 70 60, 22 58 C 12 57, 8 47, 8 34 C 8 21, 12 11, 22 10 Z"
                />
              </svg>
              <span className="btn-seal" aria-hidden="true" />
              <span className="btn-label">Log in</span>
            </button>
          </div>
        </div>
      </main>

      <LoginDialog open={isLoginOpen} onClose={handleCloseLogin} triggerRef={loginTriggerRef} />
    </div>
  );
}
