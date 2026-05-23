import { useRef, useMemo } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import {
  EffectComposer,
  Bloom,
  ChromaticAberration,
  Vignette,
  Noise,
} from "@react-three/postprocessing"
import * as THREE from "three"

export type DopamineBackgroundProps = {
  emotionTag?: string
  intensity?: number
}

const PARTICLE_COUNT = 3000

function emotionToColor(emotion: string): [number, number, number] {
  switch (emotion) {
    case "angry":
      return [1.0, 0.2, 0.1]
    case "happy":
      return [1.0, 0.85, 0.1]
    case "sad":
      return [0.2, 0.4, 0.9]
    case "surprised":
      return [0.7, 0.1, 1.0]
    case "fear":
      return [0.1, 0.8, 0.8]
    case "love":
      return [1.0, 0.2, 0.6]
    case "disgust":
      return [0.3, 0.9, 0.2]
    default:
      return [0.5, 0.6, 0.8]
  }
}

function emotionToSpeed(emotion: string): number {
  switch (emotion) {
    case "angry":
      return 2.5
    case "happy":
      return 1.2
    case "sad":
      return 0.3
    case "surprised":
      return 3.0
    case "fear":
      return 2.0
    case "love":
      return 0.8
    default:
      return 0.5
  }
}

function Particles({ emotionTag, intensity }: { emotionTag?: string; intensity?: number }) {
  const meshRef = useRef<THREE.Points>(null)
  const rgb = emotionToColor(emotionTag || "neutral")
  const targetColor = useMemo(() => new THREE.Color(rgb[0], rgb[1], rgb[2]), [emotionTag])
  const currentColor = useMemo(() => new THREE.Color(rgb[0], rgb[1], rgb[2]), [])
  const pulseRef = useRef(0)
  const prevEmotionRef = useRef(emotionTag)

  const [positions, velocities, originalPositions] = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3)
    const vel = new Float32Array(PARTICLE_COUNT * 3)
    const orig = new Float32Array(PARTICLE_COUNT * 3)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 50 + Math.random() * 30
      pos[i3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i3 + 2] = r * Math.cos(phi)
      orig[i3] = pos[i3]
      orig[i3 + 1] = pos[i3 + 1]
      orig[i3 + 2] = pos[i3 + 2]
      vel[i3] = (Math.random() - 0.5) * 0.02
      vel[i3 + 1] = (Math.random() - 0.5) * 0.02
      vel[i3 + 2] = (Math.random() - 0.5) * 0.02
    }
    return [pos, vel, orig]
  }, [])

  useFrame((state) => {
    if (!meshRef.current) return
    const geometry = meshRef.current.geometry as THREE.BufferGeometry
    const posArray = geometry.attributes.position.array as Float32Array
    const time = state.clock.elapsedTime

    // Detect emotion change for pulse
    if (emotionTag !== prevEmotionRef.current) {
      pulseRef.current = 1.0
      prevEmotionRef.current = emotionTag
    }
    if (pulseRef.current > 0) pulseRef.current -= 0.015

    // Color lerp
    currentColor.lerp(targetColor, 0.05)
    const material = meshRef.current.material as THREE.PointsMaterial
    material.color.copy(currentColor)
    // Scale particle size with intensity
    material.size = 0.8 + (intensity ?? 0.5) * 0.7
    material.opacity = 0.2 + (intensity ?? 0.5) * 0.2

    const speed = emotionToSpeed(emotionTag || "neutral") * (1 + (intensity ?? 0.5) * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const x = posArray[i3]
      const y = posArray[i3 + 1]
      const z = posArray[i3 + 2]
      const rotSpeed = speed * 0.002
      const cosR = Math.cos(rotSpeed)
      const sinR = Math.sin(rotSpeed)
      posArray[i3] = x * cosR - z * sinR
      posArray[i3 + 2] = x * sinR + z * cosR
      posArray[i3 + 1] += Math.sin(time + i * 0.1) * 0.02 * speed

      // Pulse explosion (stronger)
      if (pulseRef.current > 0) {
        const pulseStrength = pulseRef.current * 2 * (1 + (intensity ?? 0.5))
        const ox = originalPositions[i3]
        const oy = originalPositions[i3 + 1]
        const oz = originalPositions[i3 + 2]
        const dist = Math.sqrt(ox * ox + oy * oy + oz * oz)
        if (dist > 0) {
          posArray[i3] += (ox / dist) * pulseStrength
          posArray[i3 + 1] += (oy / dist) * pulseStrength
          posArray[i3 + 2] += (oz / dist) * pulseStrength
        }
      }

      // Gentle return
      const rs = 0.01
      posArray[i3] += (originalPositions[i3] - posArray[i3]) * rs
      posArray[i3 + 1] += (originalPositions[i3 + 1] - posArray[i3 + 1]) * rs
      posArray[i3 + 2] += (originalPositions[i3 + 2] - posArray[i3 + 2]) * rs
    }

    geometry.attributes.position.needsUpdate = true
  })

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
    return geo
  }, [positions])

  return (
    <points ref={meshRef} geometry={geometry}>
      <pointsMaterial
        size={2.5}
        color={currentColor}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        transparent
        opacity={0.9}
      />
    </points>
  )
}

function PostEffects({ emotionTag, intensity }: { emotionTag?: string; intensity?: number }) {
  const bloomIntensity = emotionTag === "love" || emotionTag === "happy" ? 2.5 : 1.2
  const aberrationOffset =
    emotionTag === "angry" || emotionTag === "surprised" ? [0.015, 0.008] : [0.004, 0.002]

  return (
    <EffectComposer>
      <Bloom intensity={bloomIntensity * (0.5 + (intensity ?? 0.5))} luminanceThreshold={0.3} mipmapBlur />
      <ChromaticAberration offset={new THREE.Vector2(aberrationOffset[0], aberrationOffset[1])} radialModulation={false} modulationOffset={0} />
      <Vignette darkness={emotionTag === "fear" || emotionTag === "sad" ? 0.7 : 0.35} />
      <Noise opacity={0.12} />
    </EffectComposer>
  )
}

export function DopamineBackground({ emotionTag, intensity = 0.5 }: DopamineBackgroundProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
    >
      <Canvas
        gl={{
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [0, 0, 50], fov: 75 }}
        style={{ width: "100%", height: "100%" }}
      >
        <Particles emotionTag={emotionTag} intensity={intensity} />
        <PostEffects emotionTag={emotionTag} intensity={intensity} />
        <CameraRig />
      </Canvas>
    </div>
  )
}

function CameraRig() {
  useFrame((state) => {
    const t = state.clock.elapsedTime
    state.camera.position.x = Math.sin(t * 0.1) * 5
    state.camera.position.y = Math.cos(t * 0.15) * 3
    state.camera.lookAt(0, 0, 0)
  })
  return null
}
