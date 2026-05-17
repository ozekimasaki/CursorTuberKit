export type BackgroundPresetCategory =
  | "atmospheric"
  | "geometric"
  | "abstract"
  | "scene"

export type BackgroundPreset = {
  id: string
  label: string
  category: BackgroundPresetCategory
  /**
   * Full CSS `background` shorthand (or a stack of `background-image` layers)
   * that can be applied via inline style to a full-bleed div.
   * Must be self-contained (no external image URLs). Use CSS gradients,
   * conic-gradient, repeating-* gradients, or inlined data: SVGs only.
   */
  css: string
}
