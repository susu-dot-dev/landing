import { useCallback, useEffect, useRef, useState } from "react";
import { IllustratorLettering, InkCityscape } from "@/canvas";
import { LoginDialog } from "./LoginDialog";
import { StudioControls } from "./StudioControls";
import type {
  CityscapeController,
  CityscapeFactory,
  LetteringController,
  LetteringFactory,
  PaletteKey,
  ShadingMedium,
} from "./types";

const defaultCreateCityscape: CityscapeFactory = (canvas, options) =>
  new InkCityscape(canvas, options);

const defaultCreateLettering: LetteringFactory = (canvas, options) =>
  new IllustratorLettering(canvas, options);

export interface LandingStageProps {
  createCityscape?: CityscapeFactory;
  createLettering?: LetteringFactory;
  initialPalette?: PaletteKey;
  initialMedium?: ShadingMedium;
}

export function LandingStage({
  createCityscape = defaultCreateCityscape,
  createLettering = defaultCreateLettering,
  initialPalette = "sumi",
  initialMedium = "marker",
}: LandingStageProps) {
  const [palette, setPalette] = useState<PaletteKey>(initialPalette);
  const [medium, setMedium] = useState<ShadingMedium>(initialMedium);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const cityscapeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const letteringCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loginTriggerRef = useRef<HTMLButtonElement | null>(null);

  const cityscapeRef = useRef<CityscapeController | null>(null);
  const letteringRef = useRef<LetteringController | null>(null);
  const paletteRef = useRef<PaletteKey>(palette);
  const mediumRef = useRef<ShadingMedium>(medium);

  useEffect(() => {
    const cityscapeCanvas = cityscapeCanvasRef.current as HTMLCanvasElement;
    const letteringCanvas = letteringCanvasRef.current as HTMLCanvasElement;
    const stageElement = stageRef.current as HTMLDivElement;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reducedMotion = reducedMotionQuery.matches;

    const cityscape = createCityscape(cityscapeCanvas, {
      palette: paletteRef.current,
      reducedMotion,
    });

    const lettering = createLettering(letteringCanvas, {
      text: "susu.dev",
      palette: paletteRef.current,
      medium: mediumRef.current,
      reducedMotion,
    });

    cityscapeRef.current = cityscape;
    letteringRef.current = lettering;

    const handleReducedMotionChange = (event: MediaQueryListEvent) => {
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

    return () => {
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
  }, [createCityscape, createLettering]);

  useEffect(() => {
    (cityscapeRef.current as CityscapeController).setPaused(isLoginOpen);
  }, [isLoginOpen]);

  const handlePaletteChange = useCallback((nextPalette: PaletteKey) => {
    paletteRef.current = nextPalette;
    setPalette(nextPalette);
    (cityscapeRef.current as CityscapeController).setPalette(nextPalette);
    (letteringRef.current as LetteringController).setPalette(nextPalette);
  }, []);

  const handleMediumChange = useCallback((nextMedium: ShadingMedium) => {
    mediumRef.current = nextMedium;
    setMedium(nextMedium);
    (letteringRef.current as LetteringController).setMedium(nextMedium);
  }, []);

  const handleReplayLettering = useCallback(() => {
    (letteringRef.current as LetteringController).replay();
  }, []);

  const handleRedrawSkyline = useCallback(() => {
    (cityscapeRef.current as CityscapeController).regenerate();
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

      <StudioControls
        palette={palette}
        medium={medium}
        onPaletteChange={handlePaletteChange}
        onMediumChange={handleMediumChange}
        onReplayLettering={handleReplayLettering}
        onRedrawSkyline={handleRedrawSkyline}
      />

      <LoginDialog open={isLoginOpen} onClose={handleCloseLogin} triggerRef={loginTriggerRef} />
    </div>
  );
}
