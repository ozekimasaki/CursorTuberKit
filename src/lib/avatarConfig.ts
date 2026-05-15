export type AvatarMode = "svg" | "motionpng"

export type MotionPngAudioAnalysis = {
  high: number
  low: number
  rms: number
}

export type MotionPngStatusTone = "loading" | "success" | "error"

export type MotionPngAssetStatus = {
  loaded: boolean
  message: string | null
  tone: MotionPngStatusTone | null
}

export type MotionPngSettings = {
  chromaKeyColor: string
  chromaKeyEnabled: boolean
  chromaKeyFeather: number
  chromaKeyThreshold: number
  hqAudioEnabled: boolean
  offsetX: number
  offsetY: number
  scale: number
  sensitivity: number
}

export const defaultMotionPngAssetStatus: MotionPngAssetStatus = {
  loaded: false,
  message: null,
  tone: null,
}

export const defaultMotionPngSettings: MotionPngSettings = {
  chromaKeyColor: "#00ff00",
  chromaKeyEnabled: true,
  chromaKeyFeather: 36,
  chromaKeyThreshold: 92,
  hqAudioEnabled: true,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  sensitivity: 50,
}
