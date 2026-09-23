import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { STARS, CONSTELLATIONS } from '../data/stars'
import { DEFAULT_DISPLAY_CONFIG, resolveDisplayConfig } from '../config/display'
import type { DisplayConfig } from '../config/display'
import type { Star } from '../types'

/** localStorage 中显示配置覆盖项的键名，值为一份 JSON（可只含部分字段） */
const DISPLAY_OVERRIDE_KEY = 'sky-display-config'

export const useSkyStore = defineStore('sky', () => {
  const viewDate = ref(new Date())
  const zoom = ref(1.0)
  const panX = ref(0)
  const panY = ref(0)
  const showLabels = ref(true)
  const showConstLines = ref(true)
  const showGrid = ref(true)
  const selectedStar = ref<Star | null>(null)
  const searchQuery = ref('')
  const latitude = ref(39.9) // Beijing default

  // 显示配置：唯一来源见 config/display.ts；缺失/非法字段回退默认值，原因记入 displayIssues
  const displayConfig = ref<DisplayConfig>(JSON.parse(JSON.stringify(DEFAULT_DISPLAY_CONFIG)))
  const displayIssues = ref<string[]>([])

  function applyDisplayOverrides(raw: unknown) {
    const resolved = resolveDisplayConfig(raw)
    displayConfig.value = resolved.config
    displayIssues.value = resolved.issues
  }

  function loadDisplayOverrides() {
    try {
      const text = localStorage.getItem(DISPLAY_OVERRIDE_KEY)
      if (text === null) return // 无覆盖配置，静默使用默认值
      try {
        applyDisplayOverrides(JSON.parse(text))
      } catch {
        displayIssues.value = [`localStorage 中 ${DISPLAY_OVERRIDE_KEY} 不是有效 JSON，显示配置已整体回退为默认值`]
      }
    } catch {
      // localStorage 不可用（如隐私模式），使用默认值
    }
  }
  loadDisplayOverrides()

  const localSiderealTime = computed(() => {
    const d = viewDate.value
    const jd = d.getTime() / 86400000 + 2440587.5
    const T = (jd - 2451545.0) / 36525.0
    let lst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + T * T * (0.000387933 - T / 38710000)
    lst = ((lst % 360) + 360) % 360
    return lst / 15 // convert to hours
  })

  const filteredStars = computed(() => {
    if (!searchQuery.value) return []
    const q = searchQuery.value.toLowerCase()
    return STARS.filter(s => s.name.toLowerCase().includes(q)).slice(0, 5)
  })

  function projectStar(ra: number, dec: number, cx: number, cy: number, scale: number): [number, number] {
    const ha = (localSiderealTime.value - ra) * 15 * Math.PI / 180
    const decRad = dec * Math.PI / 180
    const latRad = latitude.value * Math.PI / 180

    const alt = Math.asin(Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha))
    const az = Math.atan2(-Math.cos(decRad) * Math.sin(ha), Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(ha))

    if (alt < -0.1) return [-999, -999] // below horizon

    const r = (Math.PI / 2 - alt) * scale * displayConfig.value.horizonRatio
    const x = cx + panX.value + r * Math.sin(az)
    const y = cy + panY.value - r * Math.cos(az)
    return [x, y]
  }

  function starRadius(mag: number): number {
    const star = displayConfig.value.layers.star
    return Math.max(star.minRadius, star.magBaseline - mag) * zoom.value
  }

  function spectralColor(spectral: string): string {
    const colors: Record<string, string> = {
      'O': '#9bb0ff', 'B': '#aabfff', 'A': '#cad7ff',
      'F': '#f8f7ff', 'G': '#fff4ea', 'K': '#ffd2a1', 'M': '#ffcc6f'
    }
    return colors[spectral] || '#ffffff'
  }

  function selectStar(x: number, y: number, cx: number, cy: number, scale: number) {
    let closest: Star | null = null
    let minDist = 20
    for (const star of STARS) {
      const [sx, sy] = projectStar(star.ra, star.dec, cx, cy, scale)
      const dist = Math.hypot(sx - x, sy - y)
      if (dist < minDist) { minDist = dist; closest = star }
    }
    selectedStar.value = closest
  }

  return {
    viewDate, zoom, panX, panY, showLabels, showConstLines, showGrid,
    selectedStar, searchQuery, latitude, localSiderealTime, filteredStars,
    projectStar, starRadius, spectralColor, selectStar,
    displayConfig, displayIssues, applyDisplayOverrides,
    STARS, CONSTELLATIONS
  }
})
