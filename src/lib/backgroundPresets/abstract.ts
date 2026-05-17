import type { BackgroundPreset } from "./types"

export const abstractPresets: BackgroundPreset[] = [
  {
    id: "abs-mesh-sunrise",
    label: "Mesh Sunrise",
    css: `radial-gradient(at 18% 22%, rgba(255, 168, 168, 0.85) 0%, rgba(255, 168, 168, 0) 55%), radial-gradient(at 82% 18%, rgba(255, 196, 140, 0.8) 0%, rgba(255, 196, 140, 0) 55%), radial-gradient(at 28% 82%, rgba(186, 130, 220, 0.75) 0%, rgba(186, 130, 220, 0) 55%), radial-gradient(at 78% 78%, rgba(232, 132, 178, 0.75) 0%, rgba(232, 132, 178, 0) 60%), #2a1a3a`,
    category: "abstract",
  },
  {
    id: "abs-mesh-ocean",
    label: "Mesh Ocean",
    css: `radial-gradient(at 20% 25%, rgba(120, 220, 220, 0.75) 0%, rgba(120, 220, 220, 0) 55%), radial-gradient(at 80% 20%, rgba(90, 160, 220, 0.8) 0%, rgba(90, 160, 220, 0) 55%), radial-gradient(at 30% 80%, rgba(60, 120, 190, 0.8) 0%, rgba(60, 120, 190, 0) 55%), radial-gradient(at 78% 75%, rgba(150, 230, 200, 0.7) 0%, rgba(150, 230, 200, 0) 60%), #0c2438`,
    category: "abstract",
  },
  {
    id: "abs-vaporwave",
    label: "Vaporwave",
    css: `repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.04) 0px, rgba(255, 255, 255, 0.04) 1px, transparent 1px, transparent 4px), linear-gradient(135deg, #d946a0 0%, #8a3fb5 45%, #3f7fc4 75%, #2bc4d4 100%)`,
    category: "abstract",
  },
  {
    id: "abs-holographic",
    label: "Holographic",
    css: `radial-gradient(circle at 50% 50%, rgba(20, 20, 35, 0.55) 0%, rgba(20, 20, 35, 0) 70%), conic-gradient(from 210deg at 50% 50%, #6a7fd6, #b07fd6, #d67fb5, #d6a07f, #c2d67f, #7fd6a8, #7fb5d6, #6a7fd6)`,
    category: "abstract",
  },
  {
    id: "abs-ink-wash",
    label: "Ink Wash",
    css: `radial-gradient(ellipse at 35% 40%, rgba(110, 80, 180, 0.65) 0%, rgba(110, 80, 180, 0.15) 40%, rgba(15, 12, 25, 0) 70%), #0f0c19`,
    category: "abstract",
  },
  {
    id: "abs-pastel-cotton",
    label: "Pastel Cotton",
    css: `radial-gradient(at 22% 28%, rgba(255, 210, 225, 0.8) 0%, rgba(255, 210, 225, 0) 55%), radial-gradient(at 75% 22%, rgba(210, 225, 255, 0.78) 0%, rgba(210, 225, 255, 0) 55%), radial-gradient(at 30% 78%, rgba(225, 220, 255, 0.78) 0%, rgba(225, 220, 255, 0) 55%), radial-gradient(at 80% 75%, rgba(215, 245, 225, 0.78) 0%, rgba(215, 245, 225, 0) 60%), #e8e0ee`,
    category: "abstract",
  },
  {
    id: "abs-neon-void",
    label: "Neon Void",
    css: `radial-gradient(circle at 25% 30%, rgba(220, 60, 160, 0.7) 0%, rgba(220, 60, 160, 0) 45%), radial-gradient(circle at 78% 72%, rgba(60, 180, 220, 0.7) 0%, rgba(60, 180, 220, 0) 45%), #060a1f`,
    category: "abstract",
  },
]
