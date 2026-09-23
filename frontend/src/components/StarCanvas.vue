<template>
  <canvas ref="canvasRef" class="w-full h-full bg-black cursor-crosshair"
    @click="onClick" @wheel.prevent="onWheel" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSkyStore } from '../store/sky'
import {
  displayConfig, dp, toDevicePixels, clientToDevice,
  scaledFontSize, fontString, scaledLength
} from '../config/display'
import { horizonRadius } from '../lib/projection'

const cfg = displayConfig
const store = useSkyStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let animId = 0

function draw() {
  const canvas = canvasRef.value
  if (!canvas) { animId = requestAnimationFrame(draw); return }
  const ctx = canvas.getContext('2d')!
  const w = canvas.width = toDevicePixels(canvas.offsetWidth)
  const h = canvas.height = toDevicePixels(canvas.offsetHeight)
  const cx = w / 2, cy = h / 2
  const scale = Math.min(w, h) * store.zoom

  // background
  const bg = cfg.layers.background
  ctx.fillStyle = bg.fill
  ctx.fillRect(0, 0, w, h)

  // random background stars
  const rng = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } }
  const r = rng(42)
  for (let i = 0; i < bg.count; i++) {
    ctx.fillStyle = `rgba(255,255,255,${r() * bg.alpha})`
    ctx.beginPath()
    ctx.arc(r() * w, r() * h, r() * dp(bg.radius), 0, Math.PI * 2)
    ctx.fill()
  }

  // grid
  if (store.showGrid) {
    const grid = cfg.layers.grid
    ctx.strokeStyle = grid.stroke
    ctx.lineWidth = dp(grid.lineWidth)
    for (let dec = -60; dec <= 60; dec += 30) {
      ctx.beginPath()
      for (let ra = 0; ra <= 24; ra += 0.5) {
        const [x, y] = store.projectStar(ra, dec, cx, cy, scale)
        if (x < -500) continue
        ra === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    for (let ra = 0; ra < 24; ra += 2) {
      ctx.beginPath()
      for (let dec = -90; dec <= 90; dec += 5) {
        const [x, y] = store.projectStar(ra, dec, cx, cy, scale)
        if (x < -500) continue
        dec === -90 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  }

  // constellation lines
  if (store.showConstLines) {
    const lines = cfg.layers.constLines
    ctx.strokeStyle = lines.stroke
    ctx.lineWidth = dp(lines.lineWidth)
    for (const c of store.CONSTELLATIONS) {
      for (const [i, j] of c.lines) {
        const s1 = store.STARS[i], s2 = store.STARS[j]
        const [x1, y1] = store.projectStar(s1.ra, s1.dec, cx, cy, scale)
        const [x2, y2] = store.projectStar(s2.ra, s2.dec, cx, cy, scale)
        if (x1 < -500 || x2 < -500) continue
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }
    }
  }

  // stars
  const starStyle = cfg.layers.stars
  const labelStyle = cfg.layers.labels
  const labelFontSize = scaledFontSize(labelStyle.baseSize, store.zoom)
  for (const star of store.STARS) {
    const [x, y] = store.projectStar(star.ra, star.dec, cx, cy, scale)
    if (x < -500 || x > w + 500 || y < -500 || y > h + 500) continue
    const radius = store.starRadius(star.mag)
    const color = store.spectralColor(star.spectral)
    const glowRadius = radius * starStyle.glowRadiusFactor

    // glow
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, glowRadius)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, glowRadius, 0, Math.PI * 2)
    ctx.fill()

    // core
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    // label
    if (store.showLabels && star.mag < labelStyle.maxMagnitude) {
      ctx.fillStyle = labelStyle.fill
      ctx.font = fontString(false, labelFontSize)
      ctx.fillText(star.name, x + radius + dp(labelStyle.offsetX), y + dp(labelStyle.offsetY))
    }
  }

  // horizon
  const horizon = cfg.layers.horizon
  ctx.strokeStyle = horizon.stroke
  ctx.lineWidth = dp(horizon.lineWidth)
  ctx.beginPath()
  const rHorizon = horizonRadius(scale)
  for (let az = 0; az <= 360; az += 5) {
    const azRad = az * Math.PI / 180
    const x = cx + store.panX + rHorizon * Math.sin(azRad)
    const y = cy + store.panY - rHorizon * Math.cos(azRad)
    az === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()

  // constellation labels
  if (store.showLabels) {
    const constLabel = cfg.layers.constLabels
    ctx.fillStyle = constLabel.fill
    ctx.font = fontString(constLabel.bold, scaledFontSize(constLabel.baseSize, store.zoom))
    for (const c of store.CONSTELLATIONS) {
      const midStar = store.STARS[c.stars[0]]
      const [x, y] = store.projectStar(midStar.ra, midStar.dec, cx, cy, scale)
      if (x < -500) continue
      ctx.fillText(
        c.nameCn,
        x + dp(constLabel.offsetX),
        y + dp(scaledLength(constLabel.offsetY, store.zoom))
      )
    }
  }

  animId = requestAnimationFrame(draw)
}

function onClick(e: MouseEvent) {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const x = clientToDevice(e.clientX - rect.left)
  const y = clientToDevice(e.clientY - rect.top)
  const cx = canvas.width / 2, cy = canvas.height / 2
  const scale = Math.min(canvas.width, canvas.height) * store.zoom
  store.selectStar(x, y, cx, cy, scale)
}

function onWheel(e: WheelEvent) {
  store.zoom = Math.max(0.3, Math.min(3, store.zoom + (e.deltaY > 0 ? -0.1 : 0.1)))
}

onMounted(() => draw())
onUnmounted(() => cancelAnimationFrame(animId))
</script>
