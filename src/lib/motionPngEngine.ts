import type { MotionPngAudioAnalysis, MotionPngSettings, MotionPngStatusTone } from "./avatarConfig"

type MotionPngElements = {
  mouthCanvas: HTMLCanvasElement
  stage: HTMLElement
  video: HTMLVideoElement
  videoCanvas: HTMLCanvasElement
}

type MotionPngCallbacks = {
  onError?: (message: string) => void
  onFileStatus?: (status: Extract<MotionPngStatusTone, "success" | "error">, message: string) => void
  onVolumeChange?: (volume: number) => void
}

type Point = [number, number]

type MotionPngFrame = {
  quad: Point[]
  valid: boolean
}

type MotionPngTrackData = {
  calibration?: {
    offset?: [number, number]
    rotation?: number
    scale?: number
  }
  calibrationApplied?: boolean
  fps?: number
  frames: MotionPngFrame[]
}

type MouthState = "closed" | "half" | "open" | "e" | "u"

// 標準モード（非HQ）の値: ノイズフロアと初期ピーク。RMS ベース、Japanese TTS で経験則として調整。
const DEFAULT_NOISE_FLOOR = 0.002
const DEFAULT_LEVEL_PEAK = 0.02
const CHROMA_DISTANCE_MAX = Math.sqrt(255 ** 2 * 3)

// 口形状の最小更新間隔。HQ: ~22fps（応答性優先）/ 標準: ~14fps（CPU 負荷を抑える）。
const MOUTH_CHANGE_MIN_MS_HQ = 45
const MOUTH_CHANGE_MIN_MS_STD = 70

// 標準モード用 1 次 IIR ローパス係数。0.2 = 弱めの平滑化で口元の小刻みなジッタを軽減。
const STD_AUDIO_SMOOTHING = 0.2

// HQ モード用の DSP 係数。attack を速め release を遅めにし「素早く開いてゆっくり閉じる」自然な口元を作る。
const HQ_RATIO_SMOOTHING = 0.25
const HQ_ENVELOPE_ATTACK = 0.35
const HQ_ENVELOPE_RELEASE = 0.6

export class MotionPngEngine {
  private activeSprite: HTMLImageElement | null = null
  private animationFrameId: number | null = null
  private callbacks: MotionPngCallbacks
  private envelope = 0
  private hqAudioEnabled: boolean
  private isRunning = false
  private lastFrameIndex: number | null = null
  private lastMouthChange = 0
  private levelPeak = DEFAULT_LEVEL_PEAK
  private mouthCanvas: HTMLCanvasElement
  private mouthChangeMinMs: number
  private mouthCtx: CanvasRenderingContext2D
  private mouthSpriteUrls: Partial<Record<MouthState, string>> = {}
  private mouthSprites: Partial<Record<MouthState, HTMLImageElement>> = {}
  private mouthState: MouthState = "closed"
  private noiseFloor = DEFAULT_NOISE_FLOOR
  private resizeObserver: ResizeObserver | null = null
  private sensitivity: number
  private smoothedHighRatio = 0
  private stage: HTMLElement
  private trackData: MotionPngTrackData | null = null
  private video: HTMLVideoElement
  private videoCanvas: HTMLCanvasElement
  private videoCtx: CanvasRenderingContext2D
  private videoUrl: string | null = null
  private volume = 0
  private readonly handleBeforeUnload = () => this.cleanup()
  private readonly handleWindowResize = () => this.handleResize()

  private chromaKeyColor: string
  private chromaKeyEnabled: boolean
  private chromaKeyFeather: number
  private chromaKeyThreshold: number

  constructor({
    callbacks = {},
    elements,
    options,
  }: {
    callbacks?: MotionPngCallbacks
    elements: MotionPngElements
    options: MotionPngSettings
  }) {
    this.callbacks = callbacks
    this.stage = elements.stage
    this.video = elements.video
    this.videoCanvas = elements.videoCanvas
    this.mouthCanvas = elements.mouthCanvas

    const videoCtx = this.videoCanvas.getContext("2d")
    const mouthCtx = this.mouthCanvas.getContext("2d")
    if (!videoCtx || !mouthCtx) {
      throw new Error("MotionPNGTuber の描画コンテキストを初期化できませんでした。")
    }

    this.videoCtx = videoCtx
    this.mouthCtx = mouthCtx

    this.sensitivity = options.sensitivity
    this.hqAudioEnabled = options.hqAudioEnabled
    this.mouthChangeMinMs = options.hqAudioEnabled ? 45 : 70
    this.chromaKeyEnabled = options.chromaKeyEnabled
    this.chromaKeyColor = options.chromaKeyColor
    this.chromaKeyThreshold = options.chromaKeyThreshold
    this.chromaKeyFeather = options.chromaKeyFeather

    this.video.playsInline = true
    this.video.loop = true
    this.video.muted = true
    this.video.preload = "auto"
    this.video.controls = false

    this.attachLifecycle()
  }

  updateSettings(settings: MotionPngSettings) {
    this.sensitivity = settings.sensitivity
    this.hqAudioEnabled = settings.hqAudioEnabled
    this.mouthChangeMinMs = settings.hqAudioEnabled ? 45 : 70
    this.chromaKeyEnabled = settings.chromaKeyEnabled
    this.chromaKeyColor = settings.chromaKeyColor
    this.chromaKeyThreshold = settings.chromaKeyThreshold
    this.chromaKeyFeather = settings.chromaKeyFeather
    this.handleResize()
  }

  async loadFiles(files: File[]): Promise<boolean> {
    let videoFile: File | null = null
    let trackFile: File | null = null
    const spriteFiles: Partial<Record<MouthState, File>> = {}

    for (const file of files) {
      const name = file.name.toLowerCase()
      const path = file.webkitRelativePath.toLowerCase().replace(/\\/g, "/")

      if (name.includes("mouthless") && name.endsWith(".mp4")) {
        if (name.includes("h264") || !videoFile) {
          videoFile = file
        }
      }

      if (name === "mouth_track.json") {
        trackFile = file
      }

      if (path.includes("mouth/")) {
        if (name === "closed.png") spriteFiles.closed = file
        if (name === "open.png") spriteFiles.open = file
        if (name === "half.png") spriteFiles.half = file
        if (name === "e.png") spriteFiles.e = file
        if (name === "u.png") spriteFiles.u = file
      }
    }

    const missing: string[] = []
    if (!videoFile) missing.push("*_mouthless_h264.mp4")
    if (!trackFile) missing.push("mouth_track.json")
    if (!spriteFiles.closed) missing.push("mouth/closed.png")
    if (!spriteFiles.open) missing.push("mouth/open.png")

    if (missing.length > 0) {
      this.callbacks.onFileStatus?.("error", `不足: ${missing.join(", ")}`)
      return false
    }

    try {
      this.cleanup()

      const selectedVideoFile = videoFile
      const selectedTrackFile = trackFile
      if (!selectedVideoFile || !selectedTrackFile) {
        this.callbacks.onFileStatus?.("error", "必須ファイルの解決に失敗しました。")
        return false
      }

      const videoUrl = URL.createObjectURL(selectedVideoFile)
      await this.setupVideo(videoUrl)
      this.videoUrl = videoUrl

      const trackText = await selectedTrackFile.text()
      this.trackData = JSON.parse(trackText) as MotionPngTrackData

      const spriteSources: Partial<Record<MouthState, string>> = {}
      for (const [key, file] of Object.entries(spriteFiles) as Array<[MouthState, File]>) {
        spriteSources[key] = URL.createObjectURL(file)
      }
      await this.loadMouthSprites(spriteSources)

      this.setMouthState("closed", true)
      this.renderFrame()
      this.callbacks.onFileStatus?.(
        "success",
        `読み込み完了: ${this.trackData.frames.length}フレーム, ${this.trackData.fps ?? 30}fps (${this.video.videoWidth}x${this.video.videoHeight})`,
      )
      return true
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "MotionPNGTuber アセットの読み込みに失敗しました。"
      this.callbacks.onFileStatus?.("error", `読み込みエラー: ${message}`)
      return false
    }
  }

  async start() {
    if (!this.video.src || !this.trackData) {
      this.callbacks.onError?.("先に MotionPNGTuber アセットを読み込んでください。")
      return
    }

    if (this.isRunning) {
      return
    }

    this.isRunning = true

    try {
      this.video.currentTime = 0
      await this.video.play()
    } catch {
      // muted playback can still fail transiently on some browsers; continue rendering preview frames.
    }

    this.startRenderLoop()
  }

  stop() {
    this.isRunning = false
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
    this.video.pause()
  }

  cleanup() {
    this.stop()
    this.resetAudioStats()
    this.trackData = null
    this.lastFrameIndex = null
    this.setMouthState("closed", true)

    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl)
      this.videoUrl = null
    }

    for (const url of Object.values(this.mouthSpriteUrls)) {
      if (url) {
        URL.revokeObjectURL(url)
      }
    }

    this.mouthSpriteUrls = {}
    this.mouthSprites = {}
    this.activeSprite = null
    this.video.removeAttribute("src")
    this.video.load()
    this.clearCanvases()
  }

  destroy() {
    window.removeEventListener("resize", this.handleWindowResize)
    window.removeEventListener("beforeunload", this.handleBeforeUnload)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.cleanup()
  }

  setSensitivity(value: number) {
    this.sensitivity = value
  }

  setHQAudioEnabled(enabled: boolean) {
    this.hqAudioEnabled = enabled
    this.mouthChangeMinMs = enabled ? MOUTH_CHANGE_MIN_MS_HQ : MOUTH_CHANGE_MIN_MS_STD
    this.resetAudioStats()
  }

  resetAudioStats() {
    this.envelope = 0
    this.levelPeak = DEFAULT_LEVEL_PEAK
    this.noiseFloor = DEFAULT_NOISE_FLOOR
    this.smoothedHighRatio = 0
    this.volume = 0
    this.callbacks.onVolumeChange?.(0)
    this.setMouthState("closed", true)
  }

  processAudioData(data: MotionPngAudioAnalysis) {
    if (this.hqAudioEnabled) {
      this.processAudioDataHQ(data)
      return
    }

    const ratio = data.high / (data.low + data.high + 1e-6)
    const nextVolume = this.volume * (1 - STD_AUDIO_SMOOTHING) + data.rms * STD_AUDIO_SMOOTHING
    this.volume = nextVolume
    this.smoothedHighRatio = this.smoothedHighRatio * (1 - STD_AUDIO_SMOOTHING) + ratio * STD_AUDIO_SMOOTHING

    const thresholds = this.getVolumeThresholds()
    this.callbacks.onVolumeChange?.(Math.min(1, nextVolume / (thresholds.half * 1.8)))
    this.setMouthState(this.selectMouthState(nextVolume, this.smoothedHighRatio, thresholds))
  }

  private attachLifecycle() {
    window.addEventListener("resize", this.handleWindowResize)
    window.addEventListener("beforeunload", this.handleBeforeUnload)

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.handleResize())
      this.resizeObserver.observe(this.stage)
      this.resizeObserver.observe(this.videoCanvas)
      this.resizeObserver.observe(this.mouthCanvas)
    }
  }

  private async setupVideo(src: string) {
    this.video.src = src

    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        this.video.removeEventListener("loadeddata", onReady)
        this.video.removeEventListener("canplaythrough", onReady)
        resolve()
      }

      const onError = () => {
        this.video.removeEventListener("loadeddata", onReady)
        this.video.removeEventListener("canplaythrough", onReady)
        reject(new Error("動画の読み込みに失敗しました。"))
      }

      this.video.addEventListener("loadeddata", onReady)
      this.video.addEventListener("canplaythrough", onReady)
      this.video.addEventListener("error", onError, { once: true })
      this.video.load()
    })

    this.videoCanvas.width = this.video.videoWidth || 1
    this.videoCanvas.height = this.video.videoHeight || 1
    this.mouthCanvas.width = this.video.videoWidth || 1
    this.mouthCanvas.height = this.video.videoHeight || 1
    this.clearCanvases()
  }

  private async loadMouthSprites(sources: Partial<Record<MouthState, string>>) {
    this.mouthSprites = {}
    this.mouthSpriteUrls = {}

    for (const [key, src] of Object.entries(sources) as Array<[MouthState, string]>) {
      this.mouthSprites[key] = await this.loadImageFromSource(src)
      this.mouthSpriteUrls[key] = src
    }
  }

  private loadImageFromSource(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error(`画像の読み込みに失敗しました: ${src}`))
      image.src = src
    })
  }

  private clearCanvases() {
    this.videoCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.videoCtx.clearRect(0, 0, this.videoCanvas.width, this.videoCanvas.height)
    this.mouthCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.mouthCtx.clearRect(0, 0, this.mouthCanvas.width, this.mouthCanvas.height)
  }

  private startRenderLoop() {
    const loop = () => {
      if (!this.isRunning) {
        this.animationFrameId = null
        return
      }

      this.renderFrame()
      this.animationFrameId = requestAnimationFrame(loop)
    }

    loop()
  }

  private renderFrame() {
    if (!this.trackData || this.video.readyState < 2) {
      return
    }

    const fps = this.trackData.fps || 30
    const totalFrames = this.trackData.frames.length
    if (totalFrames === 0) {
      return
    }

    const frameIndex = Math.floor(this.video.currentTime * fps) % totalFrames
    this.lastFrameIndex = frameIndex
    this.renderVideoFrame()
    this.updateMouthTransform(frameIndex)
  }

  private renderVideoFrame() {
    if (this.video.readyState < 2) {
      return
    }

    const width = this.videoCanvas.width
    const height = this.videoCanvas.height
    this.videoCtx.drawImage(this.video, 0, 0, width, height)

    if (!this.chromaKeyEnabled) {
      return
    }

    const frame = this.videoCtx.getImageData(0, 0, width, height)
    applyChromaKey(frame.data, this.chromaKeyColor, this.chromaKeyThreshold, this.chromaKeyFeather)
    this.videoCtx.putImageData(frame, 0, 0)
  }

  private handleResize() {
    if (!this.trackData || this.video.readyState < 2) {
      return
    }

    this.renderVideoFrame()
    const totalFrames = this.trackData.frames.length
    if (totalFrames === 0) {
      return
    }

    const frameIndex =
      this.lastFrameIndex ?? Math.floor(this.video.currentTime * (this.trackData.fps || 30)) % totalFrames
    this.updateMouthTransform(frameIndex)
  }

  private updateMouthTransform(frameIndex: number) {
    if (!this.trackData) {
      return
    }

    const frame = this.trackData.frames[frameIndex]
    this.mouthCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.mouthCtx.clearRect(0, 0, this.mouthCanvas.width, this.mouthCanvas.height)

    if (!frame?.valid) {
      return
    }

    const sprite = this.activeSprite || this.mouthSprites.open || this.mouthSprites.closed
    if (!sprite) {
      return
    }

    const quad = this.applyCalibrationToQuad(frame.quad)
    this.drawWarpedSprite(sprite, quad)
  }

  private applyCalibrationToQuad(quad: Point[]) {
    if (!this.trackData?.calibrationApplied) {
      return quad.map(([x, y]) => [x, y] as Point)
    }

    const calibration = this.trackData.calibration ?? {}
    const offsetX = calibration.offset?.[0] ?? 0
    const offsetY = calibration.offset?.[1] ?? 0
    const scale = calibration.scale ?? 1
    const rotation = ((calibration.rotation ?? 0) * Math.PI) / 180

    let centerX = 0
    let centerY = 0
    for (const [x, y] of quad) {
      centerX += x
      centerY += y
    }
    centerX /= quad.length
    centerY /= quad.length

    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)

    return quad.map(([x, y]) => {
      const dx = (x - centerX) * scale
      const dy = (y - centerY) * scale
      return [
        dx * cos - dy * sin + centerX + offsetX,
        dx * sin + dy * cos + centerY + offsetY,
      ] as Point
    })
  }

  private drawWarpedSprite(sprite: HTMLImageElement, quad: Point[]) {
    const width = sprite.naturalWidth || sprite.width
    const height = sprite.naturalHeight || sprite.height
    if (!width || !height) {
      return
    }

    const sourcePoints: Point[] = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ]

    this.drawTriangle(sprite, sourcePoints[0], sourcePoints[1], sourcePoints[2], quad[0], quad[1], quad[2])
    this.drawTriangle(sprite, sourcePoints[0], sourcePoints[2], sourcePoints[3], quad[0], quad[2], quad[3])
  }

  private drawTriangle(
    image: HTMLImageElement,
    sourceA: Point,
    sourceB: Point,
    sourceC: Point,
    destA: Point,
    destB: Point,
    destC: Point,
  ) {
    const matrix = this.computeAffine(sourceA, sourceB, sourceC, destA, destB, destC)
    if (!matrix) {
      return
    }

    this.mouthCtx.save()
    this.mouthCtx.setTransform(1, 0, 0, 1, 0, 0)
    this.mouthCtx.beginPath()
    this.mouthCtx.moveTo(destA[0], destA[1])
    this.mouthCtx.lineTo(destB[0], destB[1])
    this.mouthCtx.lineTo(destC[0], destC[1])
    this.mouthCtx.closePath()
    this.mouthCtx.clip()
    this.mouthCtx.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
    this.mouthCtx.drawImage(image, 0, 0)
    this.mouthCtx.restore()
  }

  private computeAffine(sourceA: Point, sourceB: Point, sourceC: Point, destA: Point, destB: Point, destC: Point) {
    const [sx0, sy0] = sourceA
    const [sx1, sy1] = sourceB
    const [sx2, sy2] = sourceC
    const [dx0, dy0] = destA
    const [dx1, dy1] = destB
    const [dx2, dy2] = destC

    const denominator = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1)
    if (denominator === 0) {
      return null
    }

    return {
      a: (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denominator,
      b: (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denominator,
      c: (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denominator,
      d: (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denominator,
      e:
        (dx0 * (sx1 * sy2 - sx2 * sy1) +
          dx1 * (sx2 * sy0 - sx0 * sy2) +
          dx2 * (sx0 * sy1 - sx1 * sy0)) /
        denominator,
      f:
        (dy0 * (sx1 * sy2 - sx2 * sy1) +
          dy1 * (sx2 * sy0 - sx0 * sy2) +
          dy2 * (sx0 * sy1 - sx1 * sy0)) /
        denominator,
    }
  }

  private processAudioDataHQ(data: MotionPngAudioAnalysis) {
    const ratio = data.high / (data.low + data.high + 1e-6)
    this.smoothedHighRatio = this.smoothedHighRatio * (1 - HQ_RATIO_SMOOTHING) + ratio * HQ_RATIO_SMOOTHING

    const sensitivity = this.sensitivity / 100
    const coefficient = data.rms > this.envelope ? HQ_ENVELOPE_ATTACK : HQ_ENVELOPE_RELEASE
    this.envelope = this.envelope * (1 - coefficient) + data.rms * coefficient

    if (this.envelope < this.noiseFloor) {
      this.noiseFloor = this.noiseFloor * 0.75 + this.envelope * 0.25
    } else {
      this.noiseFloor = this.noiseFloor * 0.99 + this.envelope * 0.01
    }

    this.levelPeak = Math.max(this.envelope, this.levelPeak * 0.985)
    if (this.levelPeak < this.noiseFloor + 0.006) {
      this.levelPeak = this.noiseFloor + 0.006
    }

    const gateLevel = this.noiseFloor + 0.002 + (1 - sensitivity) * 0.008
    if (this.envelope < gateLevel) {
      this.callbacks.onVolumeChange?.(0)
      this.setMouthState("closed")
      return
    }

    const level = Math.max(0, Math.min(1, (this.envelope - this.noiseFloor) / (this.levelPeak - this.noiseFloor)))
    const shaped = Math.min(1, Math.pow(level, 0.75) * (0.6 + sensitivity * 0.8))
    this.callbacks.onVolumeChange?.(shaped)
    this.setMouthState(this.selectMouthStateHQ(shaped, this.smoothedHighRatio, this.getVolumeThresholdsHQ()))
  }

  private getVolumeThresholds() {
    const sensitivity = this.sensitivity / 100
    return {
      closed: 0.008 + (1 - sensitivity) * 0.018,
      half: 0.02 + (1 - sensitivity) * 0.06,
    }
  }

  private getVolumeThresholdsHQ() {
    const sensitivity = this.sensitivity / 100
    return {
      closed: 0.07 + (1 - sensitivity) * 0.08,
      half: 0.22 + (1 - sensitivity) * 0.12,
    }
  }

  private selectMouthState(volume: number, highRatio: number, thresholds: { closed: number; half: number }): MouthState {
    if (volume < thresholds.closed) return "closed"
    if (volume < thresholds.half) return this.mouthSpriteUrls.half ? "half" : "open"
    if (highRatio > 0.62 && this.mouthSpriteUrls.e) return "e"
    if (highRatio < 0.38 && this.mouthSpriteUrls.u) return "u"
    return "open"
  }

  private selectMouthStateHQ(level: number, highRatio: number, thresholds: { closed: number; half: number }): MouthState {
    const hasHalf = Boolean(this.mouthSpriteUrls.half)
    const hasE = Boolean(this.mouthSpriteUrls.e)
    const hasU = Boolean(this.mouthSpriteUrls.u)
    const closeThreshold = Math.max(0.02, thresholds.closed - 0.03)
    const halfDownThreshold = Math.max(closeThreshold + 0.02, thresholds.half - 0.02)

    let state = this.mouthState
    if (state === "e" || state === "u") {
      state = "open"
    }

    if (state === "closed") {
      if (level >= thresholds.half) {
        state = "open"
      } else if (level >= thresholds.closed && hasHalf) {
        state = "half"
      } else if (level >= thresholds.closed) {
        state = "open"
      }
    } else if (state === "half") {
      if (level < closeThreshold) {
        state = "closed"
      } else if (level >= thresholds.half) {
        state = "open"
      }
    } else if (level < closeThreshold) {
      state = "closed"
    } else if (level < halfDownThreshold && hasHalf) {
      state = "half"
    } else {
      state = "open"
    }

    if (state === "open") {
      if (highRatio > 0.62 && hasE) return "e"
      if (highRatio < 0.38 && hasU) return "u"
    }

    return state
  }

  private setMouthState(state: MouthState, force = false) {
    const sprite = this.mouthSprites[state] || this.mouthSprites.open || this.mouthSprites.closed
    if (!sprite) {
      return
    }

    const now = performance.now()
    if (!force && state !== this.mouthState && now - this.lastMouthChange < this.mouthChangeMinMs) {
      return
    }

    if (force || state !== this.mouthState) {
      this.mouthState = state
      this.activeSprite = sprite
      this.lastMouthChange = now
      if (this.lastFrameIndex !== null) {
        this.updateMouthTransform(this.lastFrameIndex)
      }
    }
  }
}

function applyChromaKey(data: Uint8ClampedArray, keyColor: string, threshold: number, feather: number) {
  const { b: keyB, g: keyG, r: keyR } = parseHexColor(keyColor)
  const thresholdLimit = Math.max(0, Math.min(CHROMA_DISTANCE_MAX, threshold))
  const featherLimit = Math.max(1, feather)

  for (let i = 0; i < data.length; i += 4) {
    const deltaR = data[i] - keyR
    const deltaG = data[i + 1] - keyG
    const deltaB = data[i + 2] - keyB
    const distance = Math.sqrt(deltaR * deltaR + deltaG * deltaG + deltaB * deltaB)

    if (distance <= thresholdLimit) {
      data[i + 3] = 0
      continue
    }

    if (distance < thresholdLimit + featherLimit) {
      const alpha = (distance - thresholdLimit) / featherLimit
      data[i + 3] = Math.round(data[i + 3] * alpha)
    }
  }
}

function parseHexColor(value: string) {
  const normalized = value.trim().replace("#", "")
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6)

  return {
    b: Number.parseInt(expanded.slice(4, 6), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    r: Number.parseInt(expanded.slice(0, 2), 16),
  }
}
