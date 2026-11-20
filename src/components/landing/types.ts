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

export interface PaletteOption {
  value: PaletteKey;
  label: string;
}

export interface MediumOption {
  value: ShadingMedium;
  label: string;
}

export const PALETTE_OPTIONS: readonly PaletteOption[] = [
  { value: "sumi", label: "Sumi" },
  { value: "twilight", label: "Twilight" },
  { value: "nocturne", label: "Nocturne" },
] as const;

export const MEDIUM_OPTIONS: readonly MediumOption[] = [
  { value: "marker", label: "Marker" },
  { value: "hatch", label: "Hatch" },
  { value: "pencil", label: "Pencil" },
] as const;
