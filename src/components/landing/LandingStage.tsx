import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { IllustratorLettering, InkCityscape } from "@/canvas";
import { type View as DialogMode, LoginDialog } from "./LoginDialog";
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
const RESIZE_SETTLE_MS = 350;

// Latin, Japanese "soot" (すす), and Cantonese "little" (小小). The first is always shown first.
export const TITLE_VARIANTS = ["susu.dev", "すす.dev", "小小.dev"] as const;

export function pickRandomTitle(random: () => number = Math.random, exclude?: string): string {
  const candidates = TITLE_VARIANTS.filter((title) => title !== exclude);
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index] as string;
}

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
  const [palette, setPalette] = useState<PaletteKey>(() => resolveInitialPalette(initialPalette));
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>("login");

  const stageRef = useRef<HTMLDivElement | null>(null);
  const cityscapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const letteringCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loginTriggerRef = useRef<HTMLButtonElement | null>(null);
  const registerTriggerRef = useRef<HTMLButtonElement | null>(null);

  const cityscapeRef = useRef<CityscapeController | null>(null);
  const letteringRef = useRef<LetteringController | null>(null);
  const isLoginOpenRef = useRef(isLoginOpen);
  const titleRef = useRef<string>(TITLE_VARIANTS[0]);

  useEffect(() => {
    const cityscapeCanvas = cityscapeCanvasRef.current as HTMLCanvasElement;
    const letteringCanvas = letteringCanvasRef.current as HTMLCanvasElement;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = reducedMotionQuery.matches;

    const cityscape = createCityscape(cityscapeCanvas, {
      palette,
      reducedMotion,
    });

    const lettering = createLettering(letteringCanvas, {
      text: TITLE_VARIANTS[0],
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

    // Initial sizing happens once, synchronously.
    cityscape.resize();
    lettering.resize();

    // While the window is being resized the canvases are left alone (they stretch). Once the
    // size has settled, repaint at the new size. The title is re-laid-out in its finished state,
    // without replaying the write-on animation.
    let settleTimer: number | null = null;

    const handleSettled = () => {
      settleTimer = null;
      cityscape.resize();
      lettering.resize({ replay: false });
    };

    const handleResize = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(handleSettled, RESIZE_SETTLE_MS);
    };
    window.addEventListener("resize", handleResize);

    const redrawTimer = window.setInterval(() => {
      if (!document.hidden && !reducedMotion && !isLoginOpenRef.current) {
        cityscape.regenerate();
        titleRef.current = pickRandomTitle();
        lettering.setText(titleRef.current);
      }
    }, redrawIntervalMs);

    return () => {
      window.clearInterval(redrawTimer);
      window.removeEventListener("resize", handleResize);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
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
    // Clicking cycles to a different title variant and redraws it.
    titleRef.current = pickRandomTitle(Math.random, titleRef.current);
    (letteringRef.current as LetteringController).setText(titleRef.current);
  }, []);

  const handleOpenLogin = useCallback(() => {
    setDialogMode("login");
    setIsLoginOpen(true);
  }, []);

  const handleOpenRegister = useCallback(() => {
    setDialogMode("register");
    setIsLoginOpen(true);
  }, []);

  // Clicking the bare background (not a control or the dialog) cycles to the next palette.
  const handleStageClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest("button, a, input, dialog")) return;
    setPalette((current) => {
      const next =
        PALETTE_KEYS[(PALETTE_KEYS.indexOf(current) + 1) % PALETTE_KEYS.length] ?? "sumi";
      try {
        window.sessionStorage.setItem(PALETTE_STORAGE_KEY, next);
      } catch {
        // Ignore storage failures in restricted browsing contexts.
      }
      return next;
    });
  }, []);

  const handleCloseLogin = useCallback(() => {
    setIsLoginOpen(false);
  }, []);

  return (
    // Pointer-only shortcut on a decorative background; the palette is not essential to use the page.
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: see above
    <div ref={stageRef} className="landing-stage" data-palette={palette} onClick={handleStageClick}>
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
            <p className="auth-register-prompt">
              New here?{" "}
              <button
                ref={registerTriggerRef}
                type="button"
                className="auth-register-link"
                aria-haspopup="dialog"
                onClick={handleOpenRegister}
              >
                Register
              </button>
            </p>
          </div>
        </div>
      </main>

      <LoginDialog
        open={isLoginOpen}
        mode={dialogMode}
        onClose={handleCloseLogin}
        triggerRef={dialogMode === "register" ? registerTriggerRef : loginTriggerRef}
      />
    </div>
  );
}
