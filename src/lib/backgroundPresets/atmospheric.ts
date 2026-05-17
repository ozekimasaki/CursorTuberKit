import type { BackgroundPreset } from "./types"

export const atmosphericPresets: BackgroundPreset[] = [
  {
    id: "atm-dawn-sky",
    label: "Dawn Sky",
    category: "atmospheric",
    css: `radial-gradient(ellipse 60% 40% at 30% 78%, rgba(255, 220, 180, 0.55), rgba(255, 220, 180, 0) 70%), linear-gradient(180deg, #8fb6d6 0%, #b8c9da 35%, #e8c9b0 70%, #f3d3b2 90%, #efc9a4 100%), #b8c9da`,
  },
  {
    id: "atm-sunset",
    label: "Sunset",
    category: "atmospheric",
    css: `radial-gradient(ellipse 70% 35% at 50% 95%, rgba(255, 180, 120, 0.55), rgba(255, 180, 120, 0) 70%), linear-gradient(180deg, #1e1a3a 0%, #3a2a5a 25%, #7a3b6b 50%, #c25a55 72%, #e08a4a 88%, #d97a3a 100%), #1e1a3a`,
  },
  {
    id: "atm-twilight-stars",
    label: "Twilight Stars",
    category: "atmospheric",
    css: `radial-gradient(1px 1px at 12% 18%, rgba(255,255,255,0.85), transparent 60%), radial-gradient(1px 1px at 27% 42%, rgba(255,255,255,0.7), transparent 60%), radial-gradient(1.5px 1.5px at 48% 22%, rgba(255,255,255,0.9), transparent 60%), radial-gradient(1px 1px at 63% 12%, rgba(255,255,255,0.6), transparent 60%), radial-gradient(1px 1px at 78% 35%, rgba(255,255,255,0.75), transparent 60%), radial-gradient(1.5px 1.5px at 88% 8%, rgba(255,255,255,0.85), transparent 60%), radial-gradient(1px 1px at 35% 60%, rgba(255,255,255,0.5), transparent 60%), radial-gradient(1px 1px at 70% 52%, rgba(255,255,255,0.55), transparent 60%), linear-gradient(180deg, #0b1030 0%, #1a1648 35%, #2a1a55 65%, #3a2466 90%, #2a1a4a 100%), #0b1030`,
  },
  {
    id: "atm-aurora",
    label: "Aurora",
    category: "atmospheric",
    css: `radial-gradient(ellipse 35% 90% at 25% 40%, rgba(80, 230, 180, 0.45), rgba(80, 230, 180, 0) 70%), radial-gradient(ellipse 30% 85% at 55% 30%, rgba(120, 200, 255, 0.4), rgba(120, 200, 255, 0) 70%), radial-gradient(ellipse 35% 90% at 80% 45%, rgba(180, 130, 230, 0.45), rgba(180, 130, 230, 0) 70%), linear-gradient(180deg, #0a1530 0%, #14254a 50%, #1c2a55 100%), #0a1530`,
  },
  {
    id: "atm-nebula",
    label: "Nebula",
    category: "atmospheric",
    css: `radial-gradient(ellipse 40% 35% at 25% 35%, rgba(220, 90, 160, 0.55), rgba(220, 90, 160, 0) 70%), radial-gradient(ellipse 45% 40% at 70% 55%, rgba(90, 130, 230, 0.55), rgba(90, 130, 230, 0) 70%), radial-gradient(ellipse 30% 30% at 50% 80%, rgba(200, 120, 230, 0.4), rgba(200, 120, 230, 0) 70%), radial-gradient(ellipse 25% 25% at 85% 20%, rgba(255, 180, 120, 0.3), rgba(255, 180, 120, 0) 70%), linear-gradient(180deg, #060812 0%, #0d0f24 50%, #07091a 100%), #060812`,
  },
  {
    id: "atm-ocean-horizon",
    label: "Ocean Horizon",
    category: "atmospheric",
    css: `linear-gradient(180deg, rgba(255,255,255,0) 48%, rgba(220,230,235,0.25) 50%, rgba(255,255,255,0) 52%), linear-gradient(180deg, #a8c4d6 0%, #c5d6e0 40%, #d8dde0 50%, #4a6680 52%, #2c4a66 75%, #1a3450 100%), #a8c4d6`,
  },
  {
    id: "atm-overcast-soft",
    label: "Overcast Soft",
    category: "atmospheric",
    css: `radial-gradient(ellipse 70% 30% at 30% 35%, rgba(255,255,255,0.18), rgba(255,255,255,0) 70%), radial-gradient(ellipse 60% 25% at 75% 60%, rgba(255,255,255,0.14), rgba(255,255,255,0) 70%), linear-gradient(180deg, #6f7d8a 0%, #8a96a2 45%, #a3adb6 100%), #8a96a2`,
  },
  {
    id: "atm-golden-fields",
    label: "Golden Fields",
    category: "atmospheric",
    css: `linear-gradient(180deg, rgba(120,80,50,0) 64%, rgba(120,80,50,0.35) 66%, rgba(120,80,50,0) 68%), linear-gradient(180deg, #f0c27b 0%, #f3b56a 30%, #e89a52 55%, #b87a45 66%, #8a5a3a 80%, #6a4630 100%), #e89a52`,
  },
]
