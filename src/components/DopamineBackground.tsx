import { useEffect, useRef } from "react"
import * as THREE from "three"

export type DopamineBackgroundProps = {
  emotionTag?: string
  intensity?: number
}

const PARTICLE_COUNT = 8000
const BASE_SIZE = 2.5

function emotionToColor(emotion: string): THREE.Color {
  const c = new THREE.Color()
  switch (emotion) {
    case "angry":
      c.setHSL(0 / 360, 0.9, 0.55)
      break
    case "happy":
      c.setHSL(50 / 360, 0.95, 0.6)
      break
    case "sad":
      c.setHSL(220 / 360, 0.7, 0.6)
      break
    case "surprised":
      c.setHSL(280 / 360, 0.85, 0.6)
      break
    case "fear":
      c.setHSL(180 / 360, 0.8, 0.55)
      break
    case "love":
      c.setHSL(330 / 360, 0.9, 0.7)
      break
    case "disgust":
      c.setHSL(90 / 360, 0.6, 0.5)
      break
    default:
      c.setHSL(200 / 360, 0.4, 0.8)
  }
  return c
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

export function DopamineBackground({ emotionTag, intensity = 0.5 }: DopamineBackgroundProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const particlesRef = useRef<THREE.Points | null>(null)
  const animFrameRef = useRef<number>(0)
  const targetColorRef = useRef(new THREE.Color())
  const currentColorRef = useRef(new THREE.Color())
  const pulseTimeRef = useRef(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Scene setup
    const scene = new THREE.Scene()
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.z = 50
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.style.display = "block"
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // Particles
    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const velocities = new Float32Array(PARTICLE_COUNT * 3)
    const originalPositions = new Float32Array(PARTICLE_COUNT * 3)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 30 + Math.random() * 40

      positions[i3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      positions[i3 + 2] = r * Math.cos(phi)

      originalPositions[i3] = positions[i3]
      originalPositions[i3 + 1] = positions[i3 + 1]
      originalPositions[i3 + 2] = positions[i3 + 2]

      velocities[i3] = (Math.random() - 0.5) * 0.02
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.02
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.02
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))

    const material = new THREE.PointsMaterial({
      size: BASE_SIZE,
      vertexColors: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.8,
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)
    particlesRef.current = particles

    currentColorRef.current.set(emotionToColor(emotionTag || "neutral"))
    targetColorRef.current.copy(currentColorRef.current)
    material.color.copy(currentColorRef.current)

    // Animation loop
    let time = 0
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate)
      time += 0.01

      // Color lerp
      currentColorRef.current.lerp(targetColorRef.current, 0.05)
      material.color.copy(currentColorRef.current)

      // Pulse decay
      if (pulseTimeRef.current > 0) {
        pulseTimeRef.current -= 0.02
      }

      const speed = emotionToSpeed(emotionTag || "neutral") * (1 + intensity)
      const posArray = geometry.attributes.position.array as Float32Array

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3

        // Orbital rotation
        const x = posArray[i3]
        const y = posArray[i3 + 1]
        const z = posArray[i3 + 2]

        const rotSpeed = speed * 0.002
        const cosR = Math.cos(rotSpeed)
        const sinR = Math.sin(rotSpeed)

        // Rotate around Y axis
        posArray[i3] = x * cosR - z * sinR
        posArray[i3 + 2] = x * sinR + z * cosR

        // Slight vertical drift
        posArray[i3 + 1] += Math.sin(time + i * 0.1) * 0.02 * speed

        // Pulse explosion effect
        if (pulseTimeRef.current > 0) {
          const pulseStrength = pulseTimeRef.current * 2 * intensity
          const ox = originalPositions[i3]
          const oy = originalPositions[i3 + 1]
          const oz = originalPositions[i3 + 2]
          const dist = Math.sqrt(ox * ox + oy * oy + oz * oz)
          if (dist > 0) {
            const dirX = ox / dist
            const dirY = oy / dist
            const dirZ = oz / dist
            posArray[i3] += dirX * pulseStrength
            posArray[i3 + 1] += dirY * pulseStrength
            posArray[i3 + 2] += dirZ * pulseStrength
          }
        }

        // Gentle return to original position
        const returnStrength = 0.01
        posArray[i3] += (originalPositions[i3] - posArray[i3]) * returnStrength
        posArray[i3 + 1] += (originalPositions[i3 + 1] - posArray[i3 + 1]) * returnStrength
        posArray[i3 + 2] += (originalPositions[i3 + 2] - posArray[i3 + 2]) * returnStrength
      }

      geometry.attributes.position.needsUpdate = true

      // Camera subtle rotation
      camera.position.x = Math.sin(time * 0.1) * 5
      camera.position.y = Math.cos(time * 0.15) * 3
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
    }

    animate()

    // Resize handler
    const handleResize = () => {
      if (!container || !camera || !renderer) return
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      cancelAnimationFrame(animFrameRef.current)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
  }, []) // init once

  // Update color target + trigger pulse on emotion change
  const prevEmotionRef = useRef(emotionTag)
  useEffect(() => {
    targetColorRef.current.set(emotionToColor(emotionTag || "neutral"))
    if (emotionTag !== prevEmotionRef.current && emotionTag) {
      pulseTimeRef.current = 1.0
    }
    prevEmotionRef.current = emotionTag
  }, [emotionTag])

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        pointerEvents: "none",
      }}
    />
  )
}
