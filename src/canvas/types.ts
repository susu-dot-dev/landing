export type PaletteKey = "sumi" | "twilight" | "nocturne";

export type ShadingMedium = "marker" | "hatch" | "pencil";

export interface CityscapeOptions {
  palette?: PaletteKey;
  seed?: number;
  reducedMotion?: boolean;
  targetFps?: number;
}

export interface CityscapeController {
  setPalette(key: PaletteKey): void;
  regenerate(newSeed?: number): void;
  setReducedMotion(reduced: boolean): void;
  setPaused(paused: boolean): void;
  handlePointerMove(clientX: number, clientY: number): void;
  /** Returns true when the scene was actually rebuilt. */
  resize(): boolean;
  dispose(): void;
}

export interface LetteringOptions {
  text?: string;
  palette?: PaletteKey;
  medium?: ShadingMedium;
  reducedMotion?: boolean;
}

export interface LetteringController {
  setPalette(key: PaletteKey): void;
  setMedium(medium: ShadingMedium): void;
  setText(text: string): void;
  setReducedMotion(reduced: boolean): void;
  replay(): void;
  /**
   * Returns true when the lettering was actually re-laid-out. With `replay: false` the
   * finished lettering is redrawn immediately instead of re-running the write-on animation.
   */
  resize(opts?: { replay?: boolean }): boolean;
  dispose(): void;
}
