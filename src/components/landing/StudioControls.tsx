import { useId, useState } from "react";
import { MEDIUM_OPTIONS, PALETTE_OPTIONS, type PaletteKey, type ShadingMedium } from "./types";

export interface StudioControlsProps {
  palette: PaletteKey;
  medium: ShadingMedium;
  onPaletteChange: (palette: PaletteKey) => void;
  onMediumChange: (medium: ShadingMedium) => void;
  onReplayLettering: () => void;
  onRedrawSkyline: () => void;
}

export function StudioControls({
  palette,
  medium,
  onPaletteChange,
  onMediumChange,
  onReplayLettering,
  onRedrawSkyline,
}: StudioControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = useId();

  return (
    <aside className="studio-controls" aria-label="Look and feel studio">
      {isOpen ? (
        <section id={panelId} className="studio-panel" aria-label="Look and feel controls">
          <fieldset className="studio-group">
            <legend className="studio-group-label">Palette</legend>
            <div className="studio-pills">
              {PALETTE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="studio-pill"
                  aria-pressed={palette === option.value}
                  onClick={() => onPaletteChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="studio-group">
            <legend className="studio-group-label">Shading</legend>
            <div className="studio-pills">
              {MEDIUM_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="studio-pill"
                  aria-pressed={medium === option.value}
                  onClick={() => onMediumChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="studio-actions">
            <button type="button" className="studio-action" onClick={onReplayLettering}>
              Replay Shading
            </button>
            <button type="button" className="studio-action" onClick={onRedrawSkyline}>
              Redraw Skyline
            </button>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        className="studio-toggle"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 19l7-7 3 3-7 7-3-3z" />
          <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
          <path d="M2 2l7.586 7.586" />
        </svg>
        <span>Studio</span>
      </button>
    </aside>
  );
}
