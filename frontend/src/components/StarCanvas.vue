<template>
  <canvas ref="canvasRef" class="w-full h-full bg-black cursor-crosshair"
    @click="onClick" @wheel.prevent="onWheel" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useSkyStore } from '../store/sky'

const store = useSkyStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let animId = 0

function draw() {
  const canvas = canvasRef.value
  if (!canvas) { animId = requestAnimationFrame(draw); return }
  const ctx = canvas.getContext('2d')!
  const cfg = store.displayConfig
  const w = canvas.width = canvas.offsetWidth * cfg.pixelRatio
  const h = canvas.height = canvas.offsetHeight * cfg.pixelRatio
  const cx = w / 2, cy = h / 2
  const scale = Math.min(w, h) * store.zoom
  const starFontSize = Math.min(cfg.starFontSize * store.zoom, cfg.starFontSizeMax)
  const constFontSize = Math.min(cfg.constellationFontSize * store.zoom, cfg.constellationFontSizeMax)

  // background
  ctx.fillStyle = cfg.layers.background.color
  ctx.fillRect(0, 0, w, h)

  // random background stars
  const bgStars = cfg.layers.backgroundStars
  const rng = (seed: number) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return s / 2147483647 } }
  const r = rng(42)
  for (let i = 0; i < bgStars.count; i++) {
    ctx.fillStyle = `rgba(${bgStars.rgb},${r() * bgStars.maxOpacity})`
    ctx.beginPath()
    ctx.arc(r() * w, r() * h, r() * bgStars.maxRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  // grid
  if (store.showGrid) {
    ctx.strokeStyle = cfg.layers.grid.color
    ctx.lineWidth = cfg.layers.grid.lineWidth
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
    ctx.strokeStyle = cfg.layers.constellationLines.color
    ctx.lineWidth = cfg.layers.constellationLines.lineWidth
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
  const starStyle = cfg.layers.star
  const starLabel = cfg.layers.starLabel
  for (const star of store.STARS) {
    const [x, y] = store.projectStar(star.ra, star.dec, cx, cy, scale)
    if (x < -500 || x > w + 500 || y < -500 || y > h + 500) continue
    const radius = store.starRadius(star.mag)
    const color = store.spectralColor(star.spectral)

    // glow
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * starStyle.glowFactor)
    gradient.addColorStop(0, color)
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, radius * starStyle.glowFactor, 0, Math.PI * 2)
    ctx.fill()

    // core
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.fill()

    // label
    if (store.showLabels && star.mag < starLabel.maxMagnitude) {
      ctx.fillStyle = starLabel.color
      ctx.font = `${starFontSize}px ${cfg.labelFontFamily}`
      ctx.fillText(star.name, x + radius + starLabel.offsetX, y + starLabel.offsetY)
    }
  }

  // horizon
  ctx.strokeStyle = cfg.layers.horizon.color
  ctx.lineWidth = cfg.layers.horizon.lineWidth
  ctx.beginPath()
  for (let az = 0; az <= 360; az += 5) {
    const azRad = az * Math.PI / 180
    const r = (Math.PI / 2) * scale * cfg.horizonRatio
    const x = cx + store.panX + r * Math.sin(azRad)
    const y = cy + store.panY - r * Math.cos(azRad)
    az === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.stroke()

  // constellation labels
  if (store.showLabels) {
    const constLabel = cfg.layers.constellationLabel
    ctx.fillStyle = constLabel.color
    ctx.font = `${constLabel.fontWeight} ${constFontSize}px ${cfg.labelFontFamily}`
    for (const c of store.CONSTELLATIONS) {
      const midStar = store.STARS[c.stars[0]]
      const [x, y] = store.projectStar(midStar.ra, midStar.dec, cx, cy, scale)
      if (x < -500) continue
      ctx.fillText(c.nameCn, x + constLabel.offsetX, y - cfg.constellationLabelOffsetY * store.zoom)
    }
  }

  animId = requestAnimationFrame(draw)
}

function onClick(e: MouseEvent) {
  const canvas = canvasRef.value!
  const rect = canvas.getBoundingClientRect()
  const ratio = store.displayConfig.pixelRatio
  const x = (e.clientX - rect.left) * ratio
  const y = (e.clientY - rect.top) * ratio
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
