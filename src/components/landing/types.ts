import type {
  CityscapeController,
  CityscapeOptions,
  LetteringController,
  LetteringOptions,
  PaletteKey,
  ShadingMedium,
} from "@/canvas";

export type {
  CityscapeController,
  CityscapeOptions,
  LetteringController,
  LetteringOptions,
  PaletteKey,
  ShadingMedium,
};

export type CityscapeFactory = (
  canvas: HTMLCanvasElement,
  options?: CityscapeOptions,
) => CityscapeController;

export type LetteringFactory = (
  canvas: HTMLCanvasElement,
  options?: LetteringOptions,
) => LetteringController;

export const PALETTE_KEYS: readonly PaletteKey[] = ["sumi", "twilight", "nocturne"] as const;
