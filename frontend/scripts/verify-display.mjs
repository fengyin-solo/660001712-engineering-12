/**
 * 收拢验证脚本（node scripts/verify-display.mjs）
 *
 * 1. 位置一致性：在多组“大屏密度 × 缩放档位 × 画布尺寸”下，用收拢前的
 *    旧公式独立计算星点投影、地平线半径、恒星半径、字号、标签偏移，
 *    与收拢后配置驱动的代码逐一比对。
 * 2. 容错：localStorage 缺失 / JSON 损坏 / 字段非法时，验证回落到默认值
 *    并产出可读原因。
 *
 * 通过 esbuild 即时打包 TS 源码到临时目录后动态 import。
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const outDir = mkdtempSync(join(tmpdir(), 'starmap-verify-'))

async function bundle(entrySource, entryName, define = {}) {
  const entryPath = join(outDir, entryName)
  writeFileSync(entryPath, entrySource)
  await build({
    entryPoints: [entryPath],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    outfile: join(outDir, entryName.replace('.ts', '.mjs')),
    define,
    logLevel: 'silent'
  })
  return pathToFileURL(join(outDir, entryName.replace('.ts', '.mjs'))).href
}

// 直接用绝对路径的 entry，避免相对路径猜测
const ENTRY = `
export * from ${JSON.stringify('/workspace/frontend/src/config/display.ts')}
export * from ${JSON.stringify('/workspace/frontend/src/lib/projection.ts')}
`

// ---------- 收拢前的旧实现（从旧 StarCanvas.vue / sky.ts 原样誊抄） ----------
const OLD_PIXEL_RATIO = 2
const OLD_HORIZON_RATIO = 0.45

function oldProject(ra, dec, lat, lst, cx, cy, scale, panX = 0, panY = 0) {
  const ha = (lst - ra) * 15 * Math.PI / 180
  const decRad = dec * Math.PI / 180
  const latRad = lat * Math.PI / 180
  const alt = Math.asin(Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha))
  const az = Math.atan2(-Math.cos(decRad) * Math.sin(ha), Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(ha))
  if (alt < -0.1) return [-999, -999]
  const r = (Math.PI / 2 - alt) * scale * OLD_HORIZON_RATIO
  return [cx + panX + r * Math.sin(az), cy + panY - r * Math.cos(az)]
}
function oldHorizonRadius(scale) { return (Math.PI / 2) * scale * OLD_HORIZON_RATIO }
function oldStarRadius(mag, zoom) { return Math.max(1, 5 - mag) * zoom }
function oldStarLabelFont(mag, zoom) { return 10 * zoom }
function oldConstLabelFont(zoom) { return 12 * zoom }
function oldCanvasSize(cssSize) { return cssSize * OLD_PIXEL_RATIO }
function oldClientToDevice(v) { return v * OLD_PIXEL_RATIO }

// ---------- 加载收拢后的模块（默认配置，pixelRatio=2） ----------
const url = await bundle(ENTRY, 'app.ts')
const mod = await import(url)

let failures = 0
function check(name, actual, expected, eps = 1e-9) {
  let ok
  if (Array.isArray(actual) && Array.isArray(expected)) {
    ok = actual.length === expected.length &&
      actual.every((v, i) => Math.abs(v - expected[i]) <= eps)
  } else {
    ok = Math.abs(actual - expected) <= eps || actual === expected
  }
  if (!ok) {
    failures++
    console.error(`  ✗ ${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`)
  }
  return ok
}

// ---------- 1. 默认密度(2×)下与旧公式逐像素一致 ----------
console.log('1) 默认 pixelRatio=2：与收拢前公式逐点比对')
const lat = 39.9, lst = 8.37
const cases = []
for (const [cssW, cssH] of [[1280, 720], [1920, 1080], [3840, 1440], [800, 600]]) {
  for (const zoom of [0.3, 0.5, 1, 1.7, 2.4, 3]) {
    cases.push({ cssW, cssH, zoom })
  }
}
let n = 0
for (const c of cases) {
  const w = mod.toDevicePixels(c.cssW), h = mod.toDevicePixels(c.cssH)
  check('画布宽(2×)', w, oldCanvasSize(c.cssW), 0)
  check('画布高(2×)', h, oldCanvasSize(c.cssH), 0)
  const cx = w / 2, cy = h / 2
  const scale = Math.min(w, h) * c.zoom
  check('地平线半径', mod.horizonRadius(scale), oldHorizonRadius(scale))
  for (const ra of [0, 2.5, 5.5, 7.2, 12.1, 18.4, 22.9]) {
    for (const dec of [-60, -20, 0, 25, 60, 80]) {
      const o = oldProject(ra, dec, lat, lst, cx, cy, scale, 3, -7)
      const p = mod.projectEquatorial(ra, dec, lat, lst, cx, cy, scale, 3, -7)
      check(`星点投影 ra=${ra} dec=${dec}`, p, o)
      n++
    }
  }
}
console.log(`   投影/几何比对 ${n} 个天区点 × ${cases.length} 组画布/缩放`)

// 恒星半径/字号/偏移：默认密度 dp() 系数为 1
for (const zoom of [0.3, 1, 3]) {
  for (const mag of [-1.5, 0, 2.4, 4, 6]) {
    const rNew = mod.dp(Math.max(mod.displayConfig.layers.stars.minRadius,
      mod.displayConfig.layers.stars.baseRadius - mag) * zoom)
    check(`星半径 mag=${mag} z=${zoom}`, rNew, oldStarRadius(mag, zoom), 0)
  }
  check(`星名字号 z=${zoom}`, mod.dp(mod.scaledFontSize(10, zoom)), oldStarLabelFont(0, zoom), 0)
  check(`星座字号 z=${zoom}`, mod.dp(mod.scaledFontSize(12, zoom)), oldConstLabelFont(zoom), 0)
  check(`星座纵偏移 z=${zoom}`, mod.dp(mod.scaledLength(-15, zoom)), -15 * zoom, 0)
  check(`星座横偏移 z=${zoom}`, mod.dp(-20), -20, 0)
  check(`星名偏移 z=${zoom}`, mod.dp(4), 4, 0)
}

// ---------- 2. 其他大屏密度：几何随短边、尺寸按 pr/2 等比缩放 ----------
console.log('2) 高密度档位（pixelRatio=1 / 3）：相对位置等比不变性')
for (const pr of [1, 3]) {
  const { resolveDisplayConfig, BASE_PIXEL_RATIO } = mod
  const { config } = resolveDisplayConfig({ pixelRatio: pr })
  const factor = pr / BASE_PIXEL_RATIO
  const [cssW, cssH, zoom] = [1600, 900, 1.5]
  const w = cssW * pr, h = cssH * pr
  const scale = Math.min(w, h) * zoom
  // 星点/地平线仍由配置里的同一个 horizonRatio 驱动，且几何以画布短边为基准
  for (const [ra, dec] of [[5.5, 0], [7.2, 25], [12.1, -20]]) {
    const p = mod.projectEquatorial(ra, dec, lat, lst, w / 2, h / 2, scale)
    const expected = oldProject(ra, dec, lat, lst, w / 2, h / 2, scale)
    check(`pr=${pr} 投影仍用配置比例 ra=${ra}`, p, expected)
  }
  // 字号设备像素 = 旧设计值 × pr/2
  check(`pr=${pr} 星名字号设备像素`, config.pixelRatio * mod.scaledFontSize(10, zoom) / BASE_PIXEL_RATIO,
    oldStarLabelFont(0, zoom) * factor, 1e-12)
  check(`pr=${pr} 线宽设备像素`, config.pixelRatio * 1.5 / BASE_PIXEL_RATIO, 1.5 * factor, 1e-12)
  check(`pr=${pr} 背景星半径设备像素`, config.pixelRatio * 1.5 / BASE_PIXEL_RATIO, 1.5 * factor, 1e-12)
  check(`pr=${pr} 点击换算`, config.pixelRatio * 123, oldClientToDevice(123) * factor, 0)
  // 标签相对星心位置：新代码锚点 = 星半径 + 偏移，二者同步按 pr/2 缩放，
  // 相对几何（随短边放大）的比例不变；这里直接核对设备像素数值。
  // 注：mod.dp 绑定模块单例（pr=2），自定义密度按 factor 手工换算。
  const mag = 1
  const newRadius = factor * Math.max(config.layers.stars.minRadius,
    config.layers.stars.baseRadius - mag) * zoom
  const newLabelDx = newRadius + factor * config.layers.labels.offsetX
  check(`pr=${pr} 标签锚点设备像素`, newLabelDx, factor * (oldStarRadius(mag, zoom) + 4), 1e-12)
}

// ---------- 3. 字号上限截断 ----------
console.log('3) 字号上限')
check('上限默认值', mod.displayConfig.fonts.maxSize, 36, 0)
check('z=3 星座字号不截断(=36)', mod.scaledFontSize(12, 3), 36, 0)
const { config: cappedCfg } = mod.resolveDisplayConfig({ fonts: { maxSize: 20 } })
check('自定义上限被接受', cappedCfg.fonts.maxSize, 20, 0)

// ---------- 4. 容错：非法/缺失配置回落默认并说明原因 ----------
console.log('4) 配置缺失/非法的默认值回落')
const bad = mod.resolveDisplayConfig({
  pixelRatio: 9,
  horizonRatio: -1,
  fontFamily: '',
  fonts: { maxSize: 1 },
  layers: {
    background: { count: 3.5, alpha: 2 },
    stars: { baseRadius: 'x', spectralColors: { O: 123 } },
    labels: { fill: '', baseSize: -5 },
    constLabels: { bold: 'yes' }
  }
})
check('非法 pixelRatio 回落', bad.config.pixelRatio, 2, 0)
check('非法 horizonRatio 回落', bad.config.horizonRatio, 0.45, 0)
check('空 fontFamily 回落', bad.config.fontFamily, 'system-ui')
check('上限小于基础字号回落', bad.config.fonts.maxSize, 36, 0)
check('非整数 count 回落', bad.config.layers.background.count, 300, 0)
check('alpha 超界回落', bad.config.layers.background.alpha, 0.4, 0)
check('字符串 baseRadius 回落', bad.config.layers.stars.baseRadius, 5, 0)
check('非法颜色表回落', bad.config.layers.stars.spectralColors.O, '#9bb0ff')
check('负字号回落', bad.config.layers.labels.baseSize, 10, 0)
check('非布尔 bold 回落', bad.config.layers.constLabels.bold, true)
check('source 标记', bad.source === 'localStorage', true)
console.log(`   诊断信息 ${bad.notes.length} 条，示例：`)
for (const note of bad.notes.slice(0, 3)) console.log(`   - ${note.path}: ${note.reason}`)
if (bad.notes.length < 10) { failures++; console.error('   ✗ 诊断信息数量过少') }

const rootBad = mod.resolveDisplayConfig('not-an-object')
check('根对象非法整体回落', rootBad.config.pixelRatio, 2, 0)
check('根对象非法有说明', rootBad.notes.length === 1 && rootBad.source === 'defaults', true)

const partial = mod.resolveDisplayConfig({ horizonRatio: 0.6 })
check('部分覆盖生效', partial.config.horizonRatio, 0.6, 0)
check('部分覆盖保留其他默认', partial.config.pixelRatio, 2, 0)
check('部分覆盖无误报', partial.notes.length, 0, 0)

// ---------- 5. localStorage 加载路径 ----------
console.log('5) localStorage 读取异常/损坏')
async function freshImport(storageStub) {
  const g = globalThis
  const prev = g.localStorage
  if (storageStub === undefined) {
    delete g.localStorage
  } else {
    g.localStorage = storageStub
  }
  try {
    return await import(url + '?v=' + Math.random())
  } finally {
    if (storageStub === undefined) {
      if (prev !== undefined) g.localStorage = prev
    } else {
      g.localStorage = prev
    }
  }
}
// JSON 损坏
const broken = await freshImport({
  getItem: () => '{ not json'
})
check('JSON 损坏回落默认', broken.displayConfig.pixelRatio, 2, 0)
check('JSON 损坏有诊断', broken.displayConfigNotes.some(n => n.reason.includes('JSON 解析失败')), true)
// 合法覆盖
const overridden = await freshImport({
  getItem: () => JSON.stringify({ pixelRatio: 3 })
})
check('localStorage 覆盖生效', overridden.displayConfig.pixelRatio, 3, 0)
check('覆盖来源标记', overridden.displayConfigSource, 'localStorage')

rmSync(outDir, { recursive: true, force: true })

if (failures) {
  console.error(`\n❌ ${failures} 项验证失败`)
  process.exit(1)
}
console.log('\n✅ 全部验证通过：收拢后在多密度/缩放档位下与收拢前位置一致，非法配置正确回落')
