import { useEffect, useMemo, useRef } from "react"
import gsap from "gsap"
import catlinSvg from "../../catlin_v2.svg?raw"
import type { Emotion } from "../../shared/emotion"
import {
  defaultSinExpressionModifiers,
  type SinExpressionModifiers,
  type SinExpressionSignal,
} from "../../shared/sinsExpression"
import type { CharacterSinName } from "../../shared/characterState"
import type { Viseme } from "../lib/visemes"
import type { AvatarState } from "./MaidCatAvatar"

type CatlinV2AvatarProps = {
  emotion?: Emotion
  hideBackgroundDecor?: boolean
  state: AvatarState
  viseme?: Viseme
  sinSignal?: SinExpressionSignal
}

// Viseme shapes for the OVERLAY ellipse drawn over the original smile.
// rx / ry are expressed as a fraction of the original mouth bbox half-width /
// half-height. `smile` controls how visible the original smile-line remains
// (1 = full smile, 0 = fully replaced by the open-mouth ellipse).
type VisemeShape = { rx: number; ry: number; smile: number }

const VISEMES: Record<Viseme, VisemeShape> = {
  closed: { rx: 0.0, ry: 0.0, smile: 1.0 },
  a: { rx: 0.55, ry: 0.95, smile: 0.0 }, // wide open
  i: { rx: 0.75, ry: 0.18, smile: 0.35 }, // narrow slit, slight smile
  u: { rx: 0.28, ry: 0.45, smile: 0.0 }, // small rounded
  e: { rx: 0.6, ry: 0.4, smile: 0.15 }, // mid open
  o: { rx: 0.38, ry: 0.7, smile: 0.0 }, // tall rounded
}

const EMOTION_TINT: Record<Emotion, { blush: number; hue: number }> = {
  neutral: { blush: 1, hue: 0 },
  joy: { blush: 1.25, hue: 0 },
  delight: { blush: 1.6, hue: 4 },
  anger: { blush: 1.5, hue: -12 },
  sadness: { blush: 0.65, hue: -8 },
}

export function CatlinV2Avatar({
  state,
  viseme = "closed",
  emotion = "neutral",
  hideBackgroundDecor = false,
  sinSignal,
}: CatlinV2AvatarProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const svgHtml = useMemo(() => catlinSvg, [])

  // Keep modifiers in a ref so blink/sway/etc loops can read the latest values
  // without re-mounting their setTimeout / gsap timelines on every sin change.
  const modifiersRef = useRef<SinExpressionModifiers>(
    sinSignal?.modifiers ?? defaultSinExpressionModifiers(),
  )
  const dominantRef = useRef<CharacterSinName | null>(sinSignal?.dominant ?? null)
  useEffect(() => {
    modifiersRef.current = sinSignal?.modifiers ?? defaultSinExpressionModifiers()
    dominantRef.current = sinSignal?.dominant ?? null
  }, [sinSignal])

  // Setup: wrap the contiguous mouth cluster into a <g> (so the whole mouth
  // scales as one), then pre-compute & cache a transform-origin (in SVG
  // user-space px = the element's own bbox center) on every animated element
  // so GSAP scaleX/scaleY pivot around each part's own center.
  // Result: shape-only changes (squash/stretch) without any positional drift.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return

    svg.setAttribute("preserveAspectRatio", "xMidYMid meet")
    svg.style.width = "100%"
    svg.style.height = "100%"
    svg.style.display = "block"

    // ─── MOUTH: rebuild from scratch ──────────────────────────────────────
    // The original mouth artwork mixes nose+outline+lip fills across overlapping
    // paths in a way that's brittle to toggle (z-order + monolithic paths).
    // Strategy: HIDE the original mouth artwork entirely and draw our own:
    //   - a small nose (always visible)
    //   - a closed smile arc (shown when viseme=closed)
    //   - an open-mouth ellipse (shown otherwise)
    // Sizing/positioning derived from the original mouth-outline bbox so the
    // custom mouth lands exactly where the artist intended.
    if (!svg.querySelector("#catlin-mouth-custom")) {
      const outline = svg.querySelector<SVGGraphicsElement>('[data-group="mouth-outline"]')
      if (outline) {
        try {
          const b = outline.getBBox() // includes nose + smile region
          // Hide ALL original mouth artwork (outline + pink fills).
          svg.querySelectorAll<SVGGraphicsElement>(
            '[data-group="mouth-outline"],[data-group="mouth-pink"]',
          ).forEach((el) => { el.style.display = "none" })

          const ns = "http://www.w3.org/2000/svg"
          const wrap = document.createElementNS(ns, "g")
          wrap.setAttribute("id", "catlin-mouth-custom")

          // Geometry
          const cx = b.x + b.width / 2
          const noseY = b.y + b.height * 0.18 // upper portion = nose
          const noseW = Math.min(14, b.width * 0.18)
          const noseH = noseW * 0.62
          const lipY = b.y + b.height * 0.78 // lower portion = smile / mouth
          const lipHW = b.width * 0.32 // half-width of closed smile
          const lipHH = b.height * 0.16 // depth of smile arc

          // Nose (small inverted-triangle / rounded pink shape)
          const nose = document.createElementNS(ns, "path")
          const nx0 = cx - noseW / 2
          const nx1 = cx + noseW / 2
          const ny0 = noseY - noseH / 2
          const ny1 = noseY + noseH / 2
          // smooth rounded triangle: top-left, top-right, bottom apex with bezier
          const noseD = `M ${nx0} ${ny0} Q ${cx} ${ny0 - 1} ${nx1} ${ny0} Q ${nx1 + 1} ${(ny0 + ny1) / 2} ${cx} ${ny1} Q ${nx0 - 1} ${(ny0 + ny1) / 2} ${nx0} ${ny0} Z`
          nose.setAttribute("d", noseD)
          nose.setAttribute("fill", "#F77D8F")
          nose.setAttribute("stroke", "#221C1E")
          nose.setAttribute("stroke-width", "1.5")
          nose.setAttribute("stroke-linejoin", "round")
          nose.setAttribute("id", "catlin-mouth-nose")
          wrap.appendChild(nose)

          // Closed smile: little philtrum line down from nose + symmetric smile arc
          const closed = document.createElementNS(ns, "g")
          closed.setAttribute("id", "catlin-mouth-closed")
          const philtrum = document.createElementNS(ns, "path")
          philtrum.setAttribute("d", `M ${cx} ${ny1} L ${cx} ${lipY - 2}`)
          philtrum.setAttribute("stroke", "#221C1E")
          philtrum.setAttribute("stroke-width", "2.5")
          philtrum.setAttribute("stroke-linecap", "round")
          philtrum.setAttribute("fill", "none")
          closed.appendChild(philtrum)
          const smile = document.createElementNS(ns, "path")
          smile.setAttribute("id", "catlin-mouth-smile")
          smile.setAttribute(
            "d",
            `M ${cx - lipHW} ${lipY} Q ${cx - lipHW * 0.5} ${lipY + lipHH} ${cx} ${lipY + lipHH * 0.6} Q ${cx + lipHW * 0.5} ${lipY + lipHH} ${cx + lipHW} ${lipY}`,
          )
          smile.setAttribute("stroke", "#221C1E")
          smile.setAttribute("stroke-width", "3")
          smile.setAttribute("stroke-linecap", "round")
          smile.setAttribute("fill", "none")
          closed.appendChild(smile)
          wrap.appendChild(closed)

          // Open mouth: cavity ellipse + tongue ellipse (hidden by default)
          const open = document.createElementNS(ns, "g")
          open.setAttribute("id", "catlin-mouth-open")
          open.setAttribute("opacity", "0")
          const cavity = document.createElementNS(ns, "ellipse")
          cavity.setAttribute("cx", String(cx))
          cavity.setAttribute("cy", String(lipY + lipHH * 0.3))
          cavity.setAttribute("rx", "0")
          cavity.setAttribute("ry", "0")
          cavity.setAttribute("fill", "#3b1a22")
          cavity.setAttribute("stroke", "#221C1E")
          cavity.setAttribute("stroke-width", "2")
          cavity.setAttribute("id", "catlin-mouth-open-cavity")
          open.appendChild(cavity)
          const tongue = document.createElementNS(ns, "ellipse")
          tongue.setAttribute("cx", String(cx))
          tongue.setAttribute("cy", String(lipY + lipHH * 0.5))
          tongue.setAttribute("rx", "0")
          tongue.setAttribute("ry", "0")
          tongue.setAttribute("fill", "#f47a93")
          tongue.setAttribute("id", "catlin-mouth-open-tongue")
          open.appendChild(tongue)
          wrap.appendChild(open)

          // Append last so the custom mouth draws above everything in the face.
          svg.appendChild(wrap)

          // Cache size/anchor for the viseme effect.
          wrap.dataset.cx = String(cx)
          wrap.dataset.cy = String(lipY + lipHH * 0.3)
          wrap.dataset.hw = String(lipHW)
          wrap.dataset.hh = String(lipHH * 2.4)
          // Cache smile geometry for the smile-curve effect to rebend.
          wrap.dataset.smileCx = String(cx)
          wrap.dataset.smileLipY = String(lipY)
          wrap.dataset.smileLipHW = String(lipHW)
          wrap.dataset.smileLipHH = String(lipHH)
        } catch {
          /* ignore — fall back to original mouth */
        }
      }
    }

    // ─── EYES ───────────────────────────────────────────────────────────────
    // Cat eyes are drawn with a long curly upper lash, so the eye outline
    // bbox is much larger (and centered higher) than the visible iris.
    // Naive scaleY blink → eye appears to slide. Fix: instantly hide all
    // eye-region paths and reveal a pre-drawn closed-eye arc at the *visual*
    // eye center (estimated from white-highlight sub-paths within the outline
    // bbox). Snap on / snap off → no positional drift.
    type EyeRegion = {
      side: "left" | "right"
      paths: SVGGraphicsElement[]
      highlights: SVGGraphicsElement[]
      cx: number
      cy: number
      w: number
      h: number
    }
    const eyeRegions: EyeRegion[] = []
    for (const side of ["left", "right"] as const) {
      const outline = svg.querySelector<SVGGraphicsElement>(`[data-group="eye-${side}"]`)
      if (!outline) continue
      const ob = outline.getBBox()
      const paths: SVGGraphicsElement[] = [outline]
      const highlights: SVGGraphicsElement[] = []
      // Pull in any small sibling paths whose bbox falls inside the outline
      // bbox (highlights/pupils mis-classified into other groups).
      const all = Array.from(svg.querySelectorAll<SVGGraphicsElement>("path"))
      let visCX = ob.x + ob.width / 2
      let visCY = ob.y + ob.height / 2
      let highlightFound = false
      for (const p of all) {
        if (p === outline) continue
        try {
          const b = p.getBBox()
          const cx = b.x + b.width / 2
          const cy = b.y + b.height / 2
          if (
            cx >= ob.x && cx <= ob.x + ob.width &&
            cy >= ob.y && cy <= ob.y + ob.height &&
            b.width < 40 && b.height < 40
          ) {
            paths.push(p)
            p.dataset.eyeSide = side
            const fill = (p.getAttribute("fill") ?? "").toUpperCase()
            // Use the white highlight center as the visual eye center
            if (fill === "#FFFEFD" || fill === "#FFFFFF" || fill === "#FEFEFE") {
              highlights.push(p)
              if (!highlightFound) {
                visCX = cx
                visCY = cy
                highlightFound = true
              }
            }
          }
        } catch { /* ignore */ }
      }
      outline.dataset.eyeSide = side
      eyeRegions.push({ side, paths, highlights, cx: visCX, cy: visCY, w: ob.width, h: ob.height })
      // Pin pupil/highlight origins for scale + glance.
      for (const h of highlights) {
        try {
          const b = h.getBBox()
          gsap.set(h, { svgOrigin: `${b.x + b.width / 2} ${b.y + b.height / 2}` })
          h.dataset.origCx = String(b.x + b.width / 2)
        } catch { /* ignore */ }
      }
    }

    // Inject a closed-eye arc per side (initially hidden).
    if (!svg.querySelector("#catlin-eyes-closed")) {
      const ns = "http://www.w3.org/2000/svg"
      const wrap = document.createElementNS(ns, "g")
      wrap.setAttribute("id", "catlin-eyes-closed")
      wrap.setAttribute("style", "display: none;")
      for (const r of eyeRegions) {
        // Smiling downward arc ◡ matching the iris area
        const w = Math.max(18, Math.min(36, r.w * 0.32))
        const h = w * 0.55
        const d = `M ${r.cx - w / 2} ${r.cy} Q ${r.cx} ${r.cy + h} ${r.cx + w / 2} ${r.cy}`
        const arc = document.createElementNS(ns, "path")
        arc.setAttribute("d", d)
        arc.setAttribute("stroke", "#221C1E")
        arc.setAttribute("stroke-width", "5")
        arc.setAttribute("stroke-linecap", "round")
        arc.setAttribute("fill", "none")
        arc.dataset.eyeSide = r.side
        wrap.appendChild(arc)
      }
      // Append last so it renders above any face elements
      svg.appendChild(wrap)
    }

    // Half-lid lines (per eye) for sloth/pride "droopy/narrowed" look.
    if (!svg.querySelector("#catlin-eyes-lidded")) {
      const ns = "http://www.w3.org/2000/svg"
      const wrap = document.createElementNS(ns, "g")
      wrap.setAttribute("id", "catlin-eyes-lidded")
      wrap.setAttribute("opacity", "0")
      for (const r of eyeRegions) {
        const w = Math.max(20, Math.min(40, r.w * 0.38))
        // Place lid line *above* the iris, slightly arched downward to suggest
        // a half-closed upper lid.
        const y = r.cy - r.h * 0.05
        const arc = document.createElementNS(ns, "path")
        arc.setAttribute("d", `M ${r.cx - w / 2} ${y - 2} Q ${r.cx} ${y + 4} ${r.cx + w / 2} ${y - 2}`)
        arc.setAttribute("stroke", "#221C1E")
        arc.setAttribute("stroke-width", "4")
        arc.setAttribute("stroke-linecap", "round")
        arc.setAttribute("fill", "none")
        arc.dataset.eyeSide = r.side
        wrap.appendChild(arc)
      }
      svg.appendChild(wrap)
    }

    // Sin badge container (an empty <g> the iconic effect fills/clears).
    if (!svg.querySelector("#catlin-sin-badge")) {
      const ns = "http://www.w3.org/2000/svg"
      const badge = document.createElementNS(ns, "g")
      badge.setAttribute("id", "catlin-sin-badge")
      badge.setAttribute("opacity", "0")
      svg.appendChild(badge)
    }
    // Stash eye regions on root for the blink loop to consume
    ;(root as HTMLDivElement & {
      __catlinEyes?: Array<{
        side: "left" | "right"
        paths: SVGGraphicsElement[]
        highlights: SVGGraphicsElement[]
        cx: number
        cy: number
        w: number
        h: number
      }>
    }).__catlinEyes = eyeRegions

    // Cache origin only for blushes (we no longer scale eyes).
    const pinOrigin = (sel: string) => {
      svg.querySelectorAll<SVGGraphicsElement>(sel).forEach((el) => {
        try {
          const b = el.getBBox()
          const cx = b.x + b.width / 2
          const cy = b.y + b.height / 2
          gsap.set(el, { svgOrigin: `${cx} ${cy}` })
        } catch {
          /* not laid out yet */
        }
      })
    }
    pinOrigin('[data-group="blush-left"]')
    pinOrigin('[data-group="blush-right"]')
  }, [svgHtml])

  // Idle micro-motion on limbs: subtle, looped sway on tail and arms with
  // different periods/phases so it never looks robotic.
  //
  // Constraint: the master silhouette (idx 0) welds head+body+ears+tail+arms
  // into a single black outline that we cannot move without redrawing it.
  // The colored fills sit ON TOP of that outline, so any rotation we apply to
  // the fills will desync from the outline at the limb tip. We therefore use
  // VERY small rotation angles (≤ 0.55°) pivoted at the limb's body-side root
  // — the tip displacement stays within the outline stroke thickness (~3–4 px)
  // so the fill never visibly escapes the silhouette.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return

    const ctx = gsap.context(() => {
      const setupSway = (
        selector: string,
        pivotX: number,
        pivotY: number,
        amplitudeDeg: number,
        durationSec: number,
        startDelaySec: number,
      ) => {
        const nodes = svg.querySelectorAll<SVGGraphicsElement>(selector)
        if (nodes.length === 0) return
        const amp = Math.max(0.05, amplitudeDeg * Math.max(0.4, Math.min(2, modifiersRef.current.swayAmplitudeMul)))
        const dur = Math.max(0.5, durationSec * Math.max(0.5, Math.min(2.5, modifiersRef.current.swayPeriodMul)))
        // Pin every path to the same user-space pivot so they rotate as a
        // rigid limb without changing their relative z-order in the DOM.
        gsap.set(nodes, { svgOrigin: `${pivotX} ${pivotY}` })
        gsap.fromTo(
          nodes,
          { rotation: -amp },
          {
            rotation: amp,
            duration: dur,
            ease: "sine.inOut",
            yoyo: true,
            repeat: -1,
            delay: startDelaySec,
          },
        )
      }

      // Tail — longest reach, but pivoted at the body attachment. 0.45° at
      // tip-distance ~500 px ≈ 4 px displacement.
      setupSway('[data-group="tail"]', 660, 720, 0.45, 2.8, 0)
      // Right arm holds the tray + cupcake; they need to sway together.
      setupSway(
        '[data-group="right-arm"], [data-group="tray-items"], [data-group="tray-saucer"], [data-group="cupcake"]',
        720,
        640,
        0.3,
        3.2,
        0.8,
      )
      // Left arm + paw
      setupSway(
        '[data-group="left-arm"], [data-group="left-arm-paw"]',
        340,
        580,
        0.3,
        3.6,
        1.6,
      )
    }, root)

    return () => ctx.revert()
  }, [svgHtml, sinSignal?.modifiers.swayAmplitudeMul, sinSignal?.modifiers.swayPeriodMul])

  // State-driven body animation (container-level breathing, sway, talking bounce).
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ repeat: -1, yoyo: true })

      if (state === "speaking") {
        tl.to(svg, { y: -8, scale: 1.005, duration: 0.32, ease: "sine.inOut", transformOrigin: "50% 100%" }, 0)
      } else if (state === "thinking") {
        tl.to(svg, { rotation: 1.2, y: -2, duration: 1.4, ease: "sine.inOut", transformOrigin: "50% 100%" }, 0)
      } else if (state === "error") {
        tl.to(svg, { x: -4, duration: 0.08, ease: "power2.inOut", repeat: 3, yoyo: true }, 0)
      } else {
        tl.to(svg, { y: -3, scale: 1.003, duration: 2.4, ease: "sine.inOut", transformOrigin: "50% 100%" }, 0)
      }
    }, root)

    return () => ctx.revert()
  }, [state])

  // Blink loop: snap-hide the eye paths and snap-show the closed-eye arcs.
  // No scaling → guaranteed zero positional drift.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    if (state === "error") return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return
    const closed = svg.querySelector<SVGGElement>("#catlin-eyes-closed")
    const eyeRegions = (root as HTMLDivElement & {
      __catlinEyes?: { paths: SVGGraphicsElement[] }[]
    }).__catlinEyes
    if (!closed || !eyeRegions || eyeRegions.length === 0) return

    const allEyePaths = eyeRegions.flatMap((r) => r.paths)
    let timer: ReturnType<typeof setTimeout> | null = null
    let openTimer: ReturnType<typeof setTimeout> | null = null

    const setBlinking = (blinking: boolean) => {
      for (const p of allEyePaths) {
        p.style.visibility = blinking ? "hidden" : "visible"
      }
      closed.style.display = blinking ? "" : "none"
    }

    const scheduleNext = () => {
      const mul = Math.max(0.3, Math.min(3, modifiersRef.current.blinkIntervalMul))
      const delay = (2.0 + Math.random() * 3.0) * 1000 * mul
      timer = setTimeout(() => {
        setBlinking(true)
        openTimer = setTimeout(() => {
          setBlinking(false)
          scheduleNext()
        }, 90)
      }, delay)
    }
    scheduleNext()

    return () => {
      if (timer) clearTimeout(timer)
      if (openTimer) clearTimeout(openTimer)
      setBlinking(false)
    }
  }, [state])

  // Viseme: snap-toggle between the custom closed-smile and the open-mouth
  // ellipse. The custom nose is always visible. No tweening, zero positional
  // drift.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return
    const wrap = svg.querySelector<SVGGElement>("#catlin-mouth-custom")
    if (!wrap) return
    const closed = wrap.querySelector<SVGGElement>("#catlin-mouth-closed")
    const open = wrap.querySelector<SVGGElement>("#catlin-mouth-open")
    if (!closed || !open) return

    const hw = Number(wrap.dataset.hw ?? 0)
    const hh = Number(wrap.dataset.hh ?? 0)
    const target = VISEMES[viseme] ?? VISEMES.closed
    const rx = Math.max(0.01, target.rx * hw)
    const ry = Math.max(0.01, target.ry * hh)
    const isClosed = target.rx === 0 && target.ry === 0

    closed.style.display = isClosed ? "" : "none"
    open.style.opacity = isClosed ? "0" : "1"
    open.style.display = isClosed ? "none" : ""
    const cavity = open.querySelector("#catlin-mouth-open-cavity")
    const tongue = open.querySelector("#catlin-mouth-open-tongue")
    if (cavity) {
      cavity.setAttribute("rx", String(rx))
      cavity.setAttribute("ry", String(ry))
    }
    if (tongue) {
      tongue.setAttribute("rx", String(rx * 0.72))
      tongue.setAttribute("ry", String(ry * 0.48))
    }
  }, [viseme])

  // Emotion tint on blushes (per-element, no group wrap so z-order is preserved).
  // Combined with sin-derived `blushBaseline` so high lust/wrath warms the cheeks
  // even at neutral emotion.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return
    const tint = EMOTION_TINT[emotion]
    const baseline = sinSignal?.modifiers.blushBaseline ?? 0
    const blushes = Array.from(svg.querySelectorAll('[data-group="blush-left"],[data-group="blush-right"]')) as SVGGraphicsElement[]
    if (blushes.length === 0) return
    gsap.to(blushes, {
      opacity: Math.max(0, Math.min(1, 0.7 * tint.blush + 0.2 + baseline)),
      scale: 0.9 + 0.15 * Math.min(1.6, tint.blush) + Math.max(0, baseline * 0.2),
      duration: 0.4,
      ease: "sine.out",
      overwrite: "auto",
    })
  }, [emotion, sinSignal?.modifiers.blushBaseline])

  // Continuous sin visuals: smile curvature, half-lid droop, side glance, pupil scale, chin lift.
  // Re-applied whenever the sin signature changes. All deltas are tiny by design
  // so the persona's tendencies "leak through" without screaming for attention.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return
    const m = sinSignal?.modifiers ?? defaultSinExpressionModifiers()

    // Smile curve: rebend the closed-mouth smile Q-curve. Positive = upturned.
    const wrap = svg.querySelector<SVGGElement>("#catlin-mouth-custom")
    const smile = wrap?.querySelector<SVGPathElement>("#catlin-mouth-smile")
    if (wrap && smile) {
      const cx = Number(wrap.dataset.smileCx ?? 0)
      const lipY = Number(wrap.dataset.smileLipY ?? 0)
      const lipHW = Number(wrap.dataset.smileLipHW ?? 0)
      const lipHH = Number(wrap.dataset.smileLipHH ?? 0)
      if (lipHW > 0 && lipHH > 0) {
        // base center dip at +lipHH*0.6; smileCurve in [-1,1] shifts it ±lipHH*0.7.
        const dip = lipHH * 0.6 - m.smileCurve * lipHH * 0.7
        const ctrlY = lipY + lipHH - m.smileCurve * lipHH * 0.55
        smile.setAttribute(
          "d",
          `M ${cx - lipHW} ${lipY} Q ${cx - lipHW * 0.5} ${ctrlY} ${cx} ${lipY + dip} Q ${cx + lipHW * 0.5} ${ctrlY} ${cx + lipHW} ${lipY}`,
        )
      }
    }

    // Half-lid: opacity ∝ how closed the eyes are (eyeOpenness < 1 → reveal lid).
    const lidded = svg.querySelector<SVGGElement>("#catlin-eyes-lidded")
    if (lidded) {
      const droop = Math.max(0, Math.min(1, 1 - m.eyeOpenness))
      gsap.to(lidded, { opacity: Math.min(0.9, droop * 1.4), duration: 0.5, overwrite: "auto" })
    }

    // Side glance + pupil scale: shift & scale highlights inside each eye.
    const eyeRegions = (root as HTMLDivElement & {
      __catlinEyes?: Array<{ highlights: SVGGraphicsElement[]; w: number; side: "left" | "right" }>
    }).__catlinEyes
    if (eyeRegions) {
      for (const r of eyeRegions) {
        if (r.highlights.length === 0) continue
        const dx = m.sideGlanceX * Math.min(8, r.w * 0.08)
        gsap.to(r.highlights, {
          x: dx,
          scale: m.pupilScale,
          duration: 0.5,
          ease: "sine.out",
          overwrite: "auto",
        })
      }
    }

    // Chin lift via OUTER div CSS transform — does not conflict with the state
    // useEffect which animates the SVG element transform directly.
    root.style.setProperty("--catlin-chin-lift", String(-m.chinLift * 8))
    root.style.transform = `translateY(calc(var(--catlin-chin-lift, 0) * 1px))`
  }, [
    sinSignal?.modifiers.smileCurve,
    sinSignal?.modifiers.eyeOpenness,
    sinSignal?.modifiers.sideGlanceX,
    sinSignal?.modifiers.pupilScale,
    sinSignal?.modifiers.chinLift,
  ])

  // microTell: a brief, dominant-sin-specific reaction triggered on the
  // transition into "speaking". Always cleans itself back to baseline.
  const prevStateRef = useRef<AvatarState>(state)
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = state
    if (state !== "speaking" || prev === "speaking") return
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return
    const dominant = dominantRef.current
    if (!dominant) return

    const tweens: gsap.core.Tween[] = []

    const tail = svg.querySelectorAll<SVGGraphicsElement>('[data-group="tail"]')
    const ears = svg.querySelectorAll<SVGGraphicsElement>('[data-group="ear-left"],[data-group="ear-right"]')
    const eyeRegions = (root as HTMLDivElement & {
      __catlinEyes?: Array<{ highlights: SVGGraphicsElement[]; paths: SVGGraphicsElement[]; side: "left" | "right" }>
    }).__catlinEyes ?? []
    const blushes = Array.from(svg.querySelectorAll('[data-group="blush-left"],[data-group="blush-right"]')) as SVGGraphicsElement[]

    switch (dominant) {
      case "wrath":
        if (tail.length) {
          tweens.push(gsap.fromTo(tail, { rotation: -1.5 }, { rotation: 1.5, duration: 0.08, yoyo: true, repeat: 5, ease: "power2.inOut" }))
        }
        if (ears.length) {
          tweens.push(gsap.fromTo(ears, { y: 0 }, { y: -2, duration: 0.07, yoyo: true, repeat: 3, ease: "power2.out" }))
        }
        break
      case "greed":
        for (const r of eyeRegions) {
          if (r.highlights.length) {
            tweens.push(gsap.fromTo(r.highlights, { scale: 1 }, { scale: 1.4, duration: 0.18, yoyo: true, repeat: 1, ease: "back.out(3)" }))
          }
        }
        break
      case "envy":
        for (const r of eyeRegions) {
          if (r.highlights.length) {
            tweens.push(gsap.fromTo(r.highlights, { x: 0 }, { x: -4, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" }))
          }
        }
        break
      case "sloth": {
        // Long blink ~ 1.0s
        const eyePaths = eyeRegions.flatMap((r) => r.paths)
        const closed = svg.querySelector<SVGGElement>("#catlin-eyes-closed")
        if (eyePaths.length && closed) {
          for (const p of eyePaths) p.style.visibility = "hidden"
          closed.style.display = ""
          const t = window.setTimeout(() => {
            for (const p of eyePaths) p.style.visibility = "visible"
            closed.style.display = "none"
          }, 1000)
          tweens.push(gsap.delayedCall(0, () => undefined))
          // store timer cleanup on a tween for return path
          ;(tweens[tweens.length - 1] as unknown as { __t?: number }).__t = t
        }
        break
      }
      case "lust": {
        // Wink: hide just the left eye briefly + blush pulse.
        // Parent #catlin-eyes-closed is normally display:none, so we must show
        // it during the wink and hide the right-side arc.
        const left = eyeRegions[0]
        const closed = svg.querySelector<SVGGElement>("#catlin-eyes-closed")
        if (left && closed) {
          const closedRight = closed.querySelector<SVGPathElement>('path[data-eye-side="right"]')
          const prevParent = closed.style.display
          const prevRight = closedRight?.style.display ?? ""
          for (const p of left.paths) p.style.visibility = "hidden"
          closed.style.display = ""
          if (closedRight) closedRight.style.display = "none"
          const t = window.setTimeout(() => {
            for (const p of left.paths) p.style.visibility = "visible"
            closed.style.display = prevParent || "none"
            if (closedRight) closedRight.style.display = prevRight
          }, 380)
          tweens.push(gsap.delayedCall(0, () => undefined))
          ;(tweens[tweens.length - 1] as unknown as { __t?: number }).__t = t
        }
        if (blushes.length) {
          tweens.push(gsap.fromTo(blushes, { scale: 1 }, { scale: 1.4, duration: 0.2, yoyo: true, repeat: 1, ease: "sine.inOut" }))
        }
        break
      }
      case "gluttony": {
        // Brief tongue flash on the custom open mouth
        const wrap = svg.querySelector<SVGGElement>("#catlin-mouth-custom")
        const open = wrap?.querySelector<SVGGElement>("#catlin-mouth-open")
        const closed = wrap?.querySelector<SVGGElement>("#catlin-mouth-closed")
        const cavity = wrap?.querySelector<SVGEllipseElement>("#catlin-mouth-open-cavity")
        const tongue = wrap?.querySelector<SVGEllipseElement>("#catlin-mouth-open-tongue")
        if (open && closed && cavity && tongue) {
          const hw = Number(wrap?.dataset.hw ?? 0)
          const hh = Number(wrap?.dataset.hh ?? 0)
          cavity.setAttribute("rx", String(hw * 0.4))
          cavity.setAttribute("ry", String(hh * 0.6))
          tongue.setAttribute("rx", String(hw * 0.3))
          tongue.setAttribute("ry", String(hh * 0.4))
          closed.style.display = "none"
          open.style.opacity = "1"
          open.style.display = ""
          const t = window.setTimeout(() => {
            // Defer to the viseme effect's next apply — but in case viseme is
            // already "closed", restore manually.
            if (viseme === "closed") {
              closed.style.display = ""
              open.style.opacity = "0"
              open.style.display = "none"
            }
          }, 250)
          tweens.push(gsap.delayedCall(0, () => undefined))
          ;(tweens[tweens.length - 1] as unknown as { __t?: number }).__t = t
        }
        break
      }
      case "pride":
        // Smug: brief chin lift + slight eye narrow via lidded opacity bump
        tweens.push(gsap.fromTo(svg, { y: "+=0" }, { y: "-=4", duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" }))
        {
          const lidded = svg.querySelector<SVGGElement>("#catlin-eyes-lidded")
          if (lidded) {
            tweens.push(gsap.fromTo(lidded, { opacity: Number(lidded.getAttribute("opacity") ?? 0) }, { opacity: 0.9, duration: 0.18, yoyo: true, repeat: 1, ease: "sine.inOut" }))
          }
        }
        break
    }

    return () => {
      for (const t of tweens) {
        const handle = t as unknown as { __t?: number }
        if (handle.__t) window.clearTimeout(handle.__t)
        t.kill()
      }
    }
  }, [state])

  // Iconic decoration: when any sin is at >=80 the dominant one is shown as a
  // small symbol next to the head, gently fading in/out. Only one at a time so
  // the stage stays calm. Hidden entirely when no sin is that high.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const svg = root.querySelector("svg") as SVGSVGElement | null
    if (!svg) return
    const badge = svg.querySelector<SVGGElement>("#catlin-sin-badge")
    if (!badge) return

    const dominant = sinSignal?.dominant ?? null
    const intensity = dominant ? sinSignal?.intensities[dominant] ?? 0 : 0
    const strong = dominant && intensity >= 80
    while (badge.firstChild) badge.removeChild(badge.firstChild)

    if (!strong) {
      gsap.to(badge, { opacity: 0, duration: 0.4, overwrite: "auto" })
      return
    }

    const ns = "http://www.w3.org/2000/svg"
    const ICON: Record<CharacterSinName, { glyph: string; color: string }> = {
      pride: { glyph: "♛", color: "#c9a83b" },
      greed: { glyph: "✨", color: "#e8c84a" },
      envy: { glyph: "💧", color: "#5fa7c9" },
      wrath: { glyph: "💢", color: "#d35a4f" },
      sloth: { glyph: "z z", color: "#6a8aa6" },
      lust: { glyph: "♡", color: "#e07b9b" },
      gluttony: { glyph: "🍪", color: "#caa46b" },
    }
    const info = ICON[dominant]
    const t = document.createElementNS(ns, "text")
    // Top-right area of the viewBox (1177×1336): float near the right ear.
    t.setAttribute("x", "990")
    t.setAttribute("y", "270")
    t.setAttribute("font-size", "78")
    t.setAttribute("font-family", "system-ui, sans-serif")
    t.setAttribute("text-anchor", "middle")
    t.setAttribute("fill", info.color)
    t.setAttribute("opacity", "0.95")
    t.textContent = info.glyph
    badge.appendChild(t)
    gsap.fromTo(
      badge,
      { opacity: 0, y: -6 },
      { opacity: 0.85, y: 0, duration: 0.6, ease: "sine.out", overwrite: "auto" },
    )
  }, [sinSignal?.dominant, sinSignal?.intensities])

  return (
    <div
      aria-label={`キャットリン v2 アバター: ${state}`}
      className={`avatar avatar-catlin avatar-catlin--${state} avatar-catlin--emotion-${emotion}${hideBackgroundDecor ? " avatar-catlin--clean" : ""}`}
      dangerouslySetInnerHTML={{ __html: svgHtml }}
      ref={rootRef}
      role="img"
    />
  )
}
