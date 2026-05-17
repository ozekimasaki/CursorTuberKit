import type { BackgroundPreset } from "./types"

export const geometricPresets: BackgroundPreset[] = [
  {
    id: "geo-dot-grid",
    label: "Dot Grid",
    css: `radial-gradient(circle at center, #c9c2b6 1.5px, transparent 2px) 0 0 / 24px 24px, #f4f1ea`,
    category: "geometric",
  },
  {
    id: "geo-diagonal-stripes",
    label: "Diagonal Stripes",
    css: `repeating-linear-gradient(45deg, #e8e3d8 0 12px, #ded7c7 12px 24px)`,
    category: "geometric",
  },
  {
    id: "geo-engineering-grid",
    label: "Engineering Grid",
    css: `linear-gradient(to right, rgba(80, 110, 140, 0.25) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(to bottom, rgba(80, 110, 140, 0.25) 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(to right, rgba(80, 110, 140, 0.12) 1px, transparent 1px) 0 0 / 8px 8px, linear-gradient(to bottom, rgba(80, 110, 140, 0.12) 1px, transparent 1px) 0 0 / 8px 8px, #eef3f6`,
    category: "geometric",
  },
  {
    id: "geo-isometric-cubes",
    label: "Isometric Cubes",
    css: `linear-gradient(30deg, #d4cdbf 12%, transparent 12.5%, transparent 87%, #d4cdbf 87.5%, #d4cdbf) 0 0 / 40px 70px, linear-gradient(150deg, #d4cdbf 12%, transparent 12.5%, transparent 87%, #d4cdbf 87.5%, #d4cdbf) 0 0 / 40px 70px, linear-gradient(270deg, #d4cdbf 12%, transparent 12.5%, transparent 87%, #d4cdbf 87.5%, #d4cdbf) 0 0 / 40px 70px, #ece6d8`,
    category: "geometric",
  },
  {
    id: "geo-checker-pastel",
    label: "Pastel Checker",
    css: `conic-gradient(#f5d9d4 0 25%, #f0c6c0 0 50%, #f5d9d4 0 75%, #f0c6c0 0) 0 0 / 80px 80px`,
    category: "geometric",
  },
  {
    id: "geo-hex-pattern",
    label: "Hex Pattern",
    css: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='56' height='96' viewBox='0 0 56 96'><path d='M28 0l28 16v32L28 64 0 48V16z M28 64l28 16v32H0v-32z' fill='none' stroke='%23a8b8c4' stroke-width='1.2'/></svg>") 0 0 / 56px 96px, #eef2f5`,
    category: "geometric",
  },
  {
    id: "geo-concentric-circles",
    label: "Concentric Circles",
    css: `repeating-radial-gradient(circle at 50% 50%, #d9d2c4 0 1px, transparent 1px 24px), #f1ece1`,
    category: "geometric",
  },
  {
    id: "geo-scattered-plus",
    label: "Scattered Plus",
    css: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'><g fill='none' stroke='%23b48a78' stroke-width='1.4' stroke-linecap='round'><path d='M12 8v8M8 12h8'/><path d='M48 24v8M44 28h8'/><path d='M28 44v8M24 48h8'/><path d='M56 52v6M53 55h6'/></g></svg>") 0 0 / 64px 64px, #faf5ef`,
    category: "geometric",
  },
]
