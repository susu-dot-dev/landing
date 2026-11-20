import type { PaletteKey } from "./types";

export type RgbTuple = readonly [number, number, number];

export interface CityscapePalette {
  readonly name: string;
  readonly isDark: boolean;
  readonly skyTop: string;
  readonly skyMid: string;
  readonly skyHorizon: string;
  readonly cloudWash: string;
  readonly farHill: string;
  readonly farCity: string;
  readonly midCityFill: string;
  readonly midCityWash: string;
  readonly midCityInk: string;
  readonly heroFillLight: string;
  readonly heroFillMid: string;
  readonly heroFillDark: string;
  readonly heroRoof: string;
  readonly heroWash: string;
  readonly ink: string;
  readonly inkSoft: string;
  readonly hatch: string;
  readonly waterTop: string;
  readonly waterMid: string;
  readonly waterDeep: string;
  readonly waterShoreWash: string;
  readonly waterPoolWash: string;
  readonly waterInkStroke: string;
  readonly waterLightStroke: string;
  readonly windowWarm: string;
  readonly windowBright: string;
  readonly lantern: string;
  readonly smoke: string;
  readonly mote: string;
}

export interface LetteringPalette {
  readonly outline: string;
  readonly outlineGhost: string;
  readonly paperUnder: string;
  readonly markerTop: RgbTuple;
  readonly markerBot: RgbTuple;
  readonly hatchPrimary: string;
  readonly hatchShadow: string;
  readonly pencilTop: RgbTuple;
  readonly pencilBot: RgbTuple;
  readonly nibColor: string;
  readonly nibAccent: string;
}

export const CITYSCAPE_PALETTES: Record<PaletteKey, CityscapePalette> = {
  sumi: {
    name: "Sumi & Vermilion",
    isDark: false,
    skyTop: "#f5efe4",
    skyMid: "#efe6d6",
    skyHorizon: "#e1d4be",
    cloudWash: "rgba(136, 124, 108, 0.085)",
    farHill: "rgba(124, 117, 108, 0.24)",
    farCity: "rgba(84, 80, 76, 0.34)",
    midCityFill: "#dfd5c4",
    midCityWash: "rgba(66, 63, 60, 0.24)",
    midCityInk: "rgba(38, 35, 33, 0.62)",
    heroFillLight: "#ece3d2",
    heroFillMid: "#d9ceb9",
    heroFillDark: "#c4b79f",
    heroRoof: "#2e2b29",
    heroWash: "rgba(32, 29, 27, 0.20)",
    ink: "#1a1816",
    inkSoft: "rgba(26, 24, 22, 0.56)",
    hatch: "rgba(26, 24, 22, 0.36)",
    waterTop: "#bcc1c5",
    waterMid: "#a5aeb5",
    waterDeep: "#8c97a1",
    waterShoreWash: "rgba(38, 42, 48, 0.22)",
    waterPoolWash: "rgba(56, 64, 74, 0.11)",
    waterInkStroke: "rgba(34, 38, 44, 0.32)",
    waterLightStroke: "rgba(248, 243, 234, 0.48)",
    windowWarm: "#f09446",
    windowBright: "#ffcf7d",
    lantern: "#d4492e",
    smoke: "rgba(72, 66, 60, 0.16)",
    mote: "rgba(230, 118, 62, 0.42)",
  },
  twilight: {
    name: "Indigo Dusk",
    isDark: false,
    skyTop: "#dfe5ee",
    skyMid: "#cdd7e5",
    skyHorizon: "#b4c2d6",
    cloudWash: "rgba(72, 92, 124, 0.11)",
    farHill: "rgba(78, 96, 124, 0.30)",
    farCity: "rgba(54, 69, 94, 0.42)",
    midCityFill: "#c3cddb",
    midCityWash: "rgba(38, 52, 78, 0.30)",
    midCityInk: "rgba(24, 34, 54, 0.68)",
    heroFillLight: "#d3dce8",
    heroFillMid: "#b5c3d6",
    heroFillDark: "#95a7c0",
    heroRoof: "#1c2638",
    heroWash: "rgba(20, 30, 48, 0.28)",
    ink: "#131a29",
    inkSoft: "rgba(19, 26, 41, 0.6)",
    hatch: "rgba(19, 26, 41, 0.38)",
    waterTop: "#a3b3c9",
    waterMid: "#8a9eb9",
    waterDeep: "#7187a6",
    waterShoreWash: "rgba(22, 34, 54, 0.26)",
    waterPoolWash: "rgba(36, 52, 78, 0.12)",
    waterInkStroke: "rgba(22, 34, 54, 0.32)",
    waterLightStroke: "rgba(242, 247, 253, 0.44)",
    windowWarm: "#eb9d3d",
    windowBright: "#ffe194",
    lantern: "#df8b2c",
    smoke: "rgba(42, 56, 82, 0.18)",
    mote: "rgba(245, 192, 98, 0.46)",
  },
  nocturne: {
    name: "Moonlit Ink",
    isDark: true,
    skyTop: "#16202c",
    skyMid: "#1e2b3b",
    skyHorizon: "#2e3e52",
    cloudWash: "rgba(176, 202, 224, 0.08)",
    farHill: "rgba(14, 21, 31, 0.65)",
    farCity: "rgba(14, 20, 30, 0.78)",
    midCityFill: "#1a2534",
    midCityWash: "rgba(8, 13, 20, 0.55)",
    midCityInk: "rgba(186, 204, 218, 0.34)",
    heroFillLight: "#212f41",
    heroFillMid: "#172230",
    heroFillDark: "#101824",
    heroRoof: "#0b1018",
    heroWash: "rgba(6, 10, 16, 0.48)",
    ink: "#c7d5de",
    inkSoft: "rgba(199, 213, 222, 0.44)",
    hatch: "rgba(199, 213, 222, 0.22)",
    waterTop: "#3c5066",
    waterMid: "#2e4054",
    waterDeep: "#223142",
    waterShoreWash: "rgba(8, 14, 22, 0.34)",
    waterPoolWash: "rgba(12, 20, 30, 0.16)",
    waterInkStroke: "rgba(14, 22, 32, 0.42)",
    waterLightStroke: "rgba(188, 224, 218, 0.28)",
    windowWarm: "#6bc7b7",
    windowBright: "#f4dfa2",
    lantern: "#78d4c3",
    smoke: "rgba(184, 204, 220, 0.12)",
    mote: "rgba(126, 222, 204, 0.45)",
  },
};

export const LETTERING_PALETTES: Record<PaletteKey, LetteringPalette> = {
  sumi: {
    outline: "#191715",
    outlineGhost: "rgba(25, 23, 21, 0.34)",
    paperUnder: "rgba(246, 240, 229, 0.72)",
    markerTop: [226, 86, 52],
    markerBot: [176, 46, 30],
    hatchPrimary: "rgba(201, 68, 42, 0.82)",
    hatchShadow: "rgba(28, 25, 23, 0.56)",
    pencilTop: [216, 76, 44],
    pencilBot: [162, 42, 28],
    nibColor: "#231e1c",
    nibAccent: "#d4492e",
  },
  twilight: {
    outline: "#131a29",
    outlineGhost: "rgba(19, 26, 41, 0.36)",
    paperUnder: "rgba(226, 232, 240, 0.72)",
    markerTop: [236, 168, 62],
    markerBot: [189, 108, 34],
    hatchPrimary: "rgba(210, 134, 42, 0.85)",
    hatchShadow: "rgba(20, 30, 50, 0.58)",
    pencilTop: [228, 152, 52],
    pencilBot: [174, 96, 28],
    nibColor: "#161e2e",
    nibAccent: "#d88a2e",
  },
  nocturne: {
    outline: "#e6e2d4",
    outlineGhost: "rgba(230, 226, 212, 0.36)",
    paperUnder: "rgba(24, 34, 46, 0.74)",
    markerTop: [142, 224, 206],
    markerBot: [74, 158, 148],
    hatchPrimary: "rgba(120, 212, 194, 0.86)",
    hatchShadow: "rgba(232, 228, 214, 0.45)",
    pencilTop: [134, 218, 200],
    pencilBot: [78, 162, 152],
    nibColor: "#efeae0",
    nibAccent: "#78d4c3",
  },
};
