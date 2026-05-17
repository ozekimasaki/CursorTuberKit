import type { BackgroundPreset } from "./types"

export const scenePresets: BackgroundPreset[] = [
  {
    id: "scn-studio-spotlight",
    label: "Studio Spotlight",
    category: "scene",
    css: `radial-gradient(ellipse 75% 55% at 50% 22%, rgba(255,245,220,0.38), rgba(255,240,210,0.10) 45%, transparent 72%), radial-gradient(ellipse 120% 60% at 50% 110%, rgba(0,0,0,0.65), transparent 60%), #15161b`,
  },
  {
    id: "scn-cozy-lamp-room",
    label: "Cozy Lamp Room",
    category: "scene",
    css: `radial-gradient(ellipse 55% 42% at 50% 28%, rgba(255,200,130,0.55), rgba(255,180,100,0.15) 45%, transparent 72%), linear-gradient(to bottom, transparent 0%, transparent 68%, rgba(40,24,14,0.55) 70%, rgba(26,16,10,0.9) 100%), linear-gradient(to bottom, #4a3528 0%, #3a2620 65%, #2a1a12 100%)`,
  },
  {
    id: "scn-window-light",
    label: "Window Light",
    category: "scene",
    css: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'><rect x='26' y='12' width='48' height='76' fill='none' stroke='rgba(255,255,255,0.28)' stroke-width='0.9'/><line x1='50' y1='12' x2='50' y2='88' stroke='rgba(255,255,255,0.22)' stroke-width='0.55'/><line x1='26' y1='50' x2='74' y2='50' stroke='rgba(255,255,255,0.22)' stroke-width='0.55'/></svg>") center / 55% 78% no-repeat, linear-gradient(to right, rgba(180,210,235,0) 0%, rgba(225,238,250,0.32) 50%, rgba(180,210,235,0) 100%), linear-gradient(to bottom, #6a8aa8 0%, #557692 55%, #3a5268 100%)`,
  },
  {
    id: "scn-stage-curtain",
    label: "Stage Curtain",
    category: "scene",
    css: `radial-gradient(ellipse 70% 32% at 50% 0%, rgba(255,210,160,0.5), rgba(255,180,120,0.15) 40%, transparent 75%), repeating-linear-gradient(to right, #3e0810 0px, #5c1018 14px, #7a1824 28px, #5c1018 42px, #3e0810 56px), #2e060c`,
  },
  {
    id: "scn-neon-city-night",
    label: "Neon City Night",
    category: "scene",
    css: `repeating-linear-gradient(to right, transparent 0px, transparent 90px, rgba(255,90,200,0.07) 90px, rgba(255,90,200,0.07) 92px, transparent 92px, transparent 210px, rgba(90,210,255,0.09) 210px, rgba(90,210,255,0.09) 212px, transparent 212px, transparent 360px), radial-gradient(ellipse 110% 32% at 50% 72%, rgba(255,80,180,0.45), rgba(120,40,200,0.22) 40%, transparent 72%), linear-gradient(to bottom, #14062a 0%, #261148 45%, #170930 80%, #0a0418 100%)`,
  },
  {
    id: "scn-cafe-afternoon",
    label: "Café Afternoon",
    category: "scene",
    css: `radial-gradient(ellipse 32% 22% at 50% 16%, rgba(255,220,160,0.6), rgba(255,200,140,0.18) 50%, transparent 78%), linear-gradient(to bottom, transparent 0%, transparent 68%, rgba(86,52,30,0.55) 70%, rgba(60,36,20,0.9) 100%), linear-gradient(to bottom, #f1e3c8 0%, #e6d3b2 55%, #d8be94 70%)`,
  },
  {
    id: "scn-classroom-morning",
    label: "Classroom Morning",
    category: "scene",
    css: `radial-gradient(ellipse 45% 28% at 82% 14%, rgba(255,248,205,0.45), transparent 72%), linear-gradient(to bottom, #ecefd6 0%, #dee6c4 30%, #1f3a28 33%, #16301f 60%, #dee6c4 63%, #d0d8b8 100%)`,
  },
]
