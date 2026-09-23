/**
 * 显示配置（单一事实来源）
 * ---------------------------------------------------------------
 * 画布绘制中用到的所有“显示相关”默认值都集中在本文件：
 *   - 屏幕像素密度 pixelRatio
 *   - 标签字号与字号上限 fonts
 *   - 地平线半径比例 horizonRatio
 *   - 各绘制层（背景星 / 网格 / 星座连线 / 恒星 / 星名标签 / 地平线 /
 *     星座标签）的默认样式 layers
 *
 * 绘制代码（StarCanvas.vue、store/sky.ts、lib/projection.ts）只读取
 * 这里解析好的值，不再各自书写常数。需要调整观感时只改 DEFAULT_DISPLAY_CONFIG。
 *
 * 覆盖方式：在 localStorage 的 `starmap.displayConfig` 键里放入部分 JSON
 * 字段（结构与 DisplayConfig 相同），会与默认值做深合并。
 *
 * 容错：覆盖配置缺失（不是对象 / JSON 解析失败 / 键不存在）或任意字段
 * 取值非法（类型错误、超出有效范围等）时，该字段回落到默认值，原因会被
 * 逐条记入 `displayConfigNotes`，页面侧边栏会把这些原因展示出来。
 *
 * 单位约定（重要）：
 *   - 收拢前画布后备尺寸固定为 CSS 尺寸 ×2，绘制常数都直接写在这个
 *     “2× 画布坐标系”里（字号 10/12、偏移 4/15/20、线宽 1/1.5/2、
 *     背景星半径 1.5、恒星基准半径 5……）。为使收拢前后逐像素一致，
 *     本配置的所有长度/字号沿用这些原始数值，单位记为“设计像素”——
 *     即以基准密度 BASE_PIXEL_RATIO(=2) 为参照的画布像素。
 *   - dp() 负责把设计像素换算为当前密度下的设备像素：
 *     设备像素 = 设计像素 × pixelRatio / BASE_PIXEL_RATIO。
 *     pixelRatio=2（默认）时换算系数为 1，渲染与收拢前完全相同；
 *     pixelRatio=3 等大屏密度下，字号/线宽/偏移/星半径与投影几何
 *     （几何随画布短边自然放大）一起等比放大，相对位置不变。
 *   - 画布本身的 CSS→设备像素尺寸仍直接乘 pixelRatio（见 toDevicePixels）。
 *   - “随缩放”的字号/长度由下方 helper 统一乘 zoom 并截断到字号上限，
 *     保证与收拢前在 0.3–3 缩放档下的像素位置完全一致。
 */

/** localStorage 键名，存放部分覆盖的显示配置（JSON） */
export const DISPLAY_CONFIG_STORAGE_KEY = 'starmap.displayConfig'

/**
 * 基准像素密度：收拢前在画布尺寸与点击换算里写死的倍数。
 * 配置中的“设计像素”即以该密度为参照；pixelRatio 取此值时整体渲染
 * 与收拢前逐像素一致。
 */
export const BASE_PIXEL_RATIO = 2

// ---------------------------- 类型定义 ----------------------------

export interface BackgroundLayerStyle {
  /** 天空底色（铺满画布的填充色） */
  fill: string
  /** 随机背景星数量（与密度无关，逐帧复用固定随机种子） */
  count: number
  /** 单颗背景星最大半径（设计像素，实际半径随机） */
  radius: number
  /** 背景星最大不透明度（实际透明度随机取 0..该值） */
  alpha: number
}

export interface GridLayerStyle {
  /** 网格线颜色（Canvas 合法颜色字符串） */
  stroke: string
  /** 网格线宽（设计像素） */
  lineWidth: number
}

export interface ConstLineLayerStyle {
  /** 星座连线颜色 */
  stroke: string
  /** 星座连线线宽（设计像素） */
  lineWidth: number
}

export interface StarLayerStyle {
  /**
   * 星等为 0 时的核心半径（设计像素，未缩放）；星等每暗 1 等半径减 1，
   * 收拢前的原始公式 max(1, 5 - mag)。
   */
  baseRadius: number
  /** 核心半径下限（设计像素，未缩放），收拢前写死为 1 */
  minRadius: number
  /** 光晕半径相对核心半径的倍数（无量纲），收拢前写死为 3 */
  glowRadiusFactor: number
  /**
   * 点击选星的拾取容差（设计像素），收拢前在 selectStar 里写死为 20。
   * 命中判定在设备像素坐标系进行，绘制层经 dp() 换算，随密度同步放大。
   */
  hitRadius: number
  /** 光谱型 → 核心/光晕颜色，键为 O/B/A/F/G/K/M */
  spectralColors: Record<string, string>
  /** 未知光谱型时的兜底颜色 */
  fallbackColor: string
}

export interface LabelLayerStyle {
  /** 星名标签文字颜色 */
  fill: string
  /** 基础字号（设计像素），实际字号 = 基础字号 × zoom，并受上限约束 */
  baseSize: number
  /** 标签相对星心的横向附加偏移（设计像素），位于核心半径之外 */
  offsetX: number
  /** 标签相对星心的纵向偏移（设计像素，固定不随缩放） */
  offsetY: number
  /** 只有亮于该视星等的恒星才显示名称标签 */
  maxMagnitude: number
}

export interface HorizonLayerStyle {
  /** 地平线圆圈颜色 */
  stroke: string
  /** 地平线圆环线宽（设计像素） */
  lineWidth: number
}

export interface ConstLabelLayerStyle {
  /** 星座名称文字颜色 */
  fill: string
  /** 基础字号（设计像素），实际字号 = 基础字号 × zoom，并受上限约束 */
  baseSize: number
  /** 是否加粗 */
  bold: boolean
  /** 相对星座参考星的横向偏移（设计像素，固定不随缩放） */
  offsetX: number
  /** 相对星座参考星的纵向基础偏移（设计像素，绘制时随缩放放大） */
  offsetY: number
}

export interface DisplayConfig {
  /**
   * 屏幕像素密度倍数：画布后备尺寸 = CSS 尺寸 × pixelRatio。
   * 收拢前在绘制与点击换算里写死为 2（= BASE_PIXEL_RATIO）；
   * 适配大屏高密度（如 3×）时只改这里，绘制尺寸经 dp() 同步等比换算。
   */
  pixelRatio: number
  /** 所有文字使用的 Canvas 字体族 */
  fontFamily: string
  fonts: {
    /** 通用字号上限（设计像素），随缩放放大的字号不会超过它 */
    maxSize: number
  }
  /**
   * 地平线半径比例：天顶(alt=90°)到地平线(alt=0°)的角距 π/2 被映射为
   * “短边半径 × horizonRatio”。星点投影与地平线圆环共用这一个常数，
   * 收拢前两处各自写死 0.45。
   */
  horizonRatio: number
  layers: {
    background: BackgroundLayerStyle
    grid: GridLayerStyle
    constLines: ConstLineLayerStyle
    stars: StarLayerStyle
    labels: LabelLayerStyle
    horizon: HorizonLayerStyle
    constLabels: ConstLabelLayerStyle
  }
}

// ---------------------------- 默认配置 ----------------------------

export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  pixelRatio: 2,
  fontFamily: 'system-ui',
  fonts: {
    // 收拢前没有显式上限；默认取缩放满档(3×)时的星座标签字号，
    // 因此在当前 0.3–3 缩放范围内上限永不生效，渲染与原来一致。
    maxSize: 36
  },
  horizonRatio: 0.45,
  layers: {
    background: {
      fill: '#000814',
      count: 300,
      radius: 1.5,
      alpha: 0.4
    },
    grid: {
      stroke: 'rgba(100,100,200,0.15)',
      lineWidth: 1
    },
    constLines: {
      stroke: 'rgba(100,180,255,0.4)',
      lineWidth: 1.5
    },
    stars: {
      baseRadius: 5,
      minRadius: 1,
      glowRadiusFactor: 3,
      hitRadius: 20,
      spectralColors: {
        O: '#9bb0ff', B: '#aabfff', A: '#cad7ff',
        F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1', M: '#ffcc6f'
      },
      fallbackColor: '#ffffff'
    },
    labels: {
      fill: 'rgba(200,200,255,0.7)',
      baseSize: 10,
      offsetX: 4,
      offsetY: 4,
      maxMagnitude: 2.5
    },
    horizon: {
      stroke: 'rgba(0,200,100,0.3)',
      lineWidth: 2
    },
    constLabels: {
      fill: 'rgba(100,180,255,0.8)',
      baseSize: 12,
      bold: true,
      offsetX: -20,
      offsetY: -15
    }
  }
}

// ---------------------------- 校验与合并 ----------------------------

/** 配置来源说明，供页面展示“当前值从哪来” */
export type DisplayConfigSource = 'defaults' | 'localStorage'

/** 单条配置诊断信息：路径 + 人类可读的原因 */
export interface DisplayConfigNote {
  path: string
  reason: string
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

interface FieldRule {
  path: string
  /** 返回 true 表示取值合法 */
  valid: (v: unknown) => boolean
  reason: string
}

/**
 * 递归收集叶子字段的校验规则（path 用点号连接）。
 * spectralColors 是整张颜色表，整体当作一个叶子字段校验。
 */
function collectRules(prefix: string, value: unknown, out: FieldRule[]): void {
  if (!isPlainObject(value)) {
    out.push({ path: prefix, valid: isFiniteNumber, reason: '应为有限数值' })
    return
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (key === 'spectralColors') {
      out.push({
        path,
        valid: v => isPlainObject(v) && Object.values(v).every(isNonEmptyString),
        reason: '应为光谱型到颜色字符串的映射对象'
      })
      continue
    }
    if (isPlainObject(child)) {
      collectRules(path, child, out)
    } else if (typeof child === 'number') {
      out.push(ruleForNumber(path))
    } else if (typeof child === 'string') {
      out.push({ path, valid: isNonEmptyString, reason: '应为非空字符串' })
    } else if (typeof child === 'boolean') {
      out.push({ path, valid: v => typeof v === 'boolean', reason: '应为布尔值 true/false' })
    }
  }
}

/** 依据默认值的语义为数值字段给出有效范围 */
function ruleForNumber(path: string): FieldRule {
  let valid: (v: unknown) => boolean = isFiniteNumber
  let reason = '应为有限数值'
  if (path === 'pixelRatio') {
    valid = v => isFiniteNumber(v) && v >= 0.5 && v <= 4
    reason = '像素密度应为 [0.5, 4] 之间的正数'
  } else if (path === 'fonts.maxSize' || path.endsWith('.baseSize')) {
    valid = v => isFiniteNumber(v) && v > 0
    reason = '字号应为正数'
  } else if (path.endsWith('lineWidth') || path.endsWith('.radius') ||
             path.endsWith('Radius') ||
             path === 'layers.stars.baseRadius' ||
             path === 'layers.stars.glowRadiusFactor' ||
             path === 'layers.background.radius') {
    valid = v => isFiniteNumber(v) && v >= 0
    reason = '线宽/半径应为非负数'
  } else if (path === 'layers.background.alpha') {
    valid = v => isFiniteNumber(v) && v >= 0 && v <= 1
    reason = '不透明度应在 [0, 1] 之间'
  } else if (path === 'layers.background.count') {
    valid = v => isFiniteNumber(v) && v >= 0 && Number.isInteger(v)
    reason = '背景星数量应为非负整数'
  } else if (path === 'horizonRatio') {
    valid = v => isFiniteNumber(v) && v > 0 && v <= 2
    reason = '地平线比例应在 (0, 2] 之间'
  } else if (path.endsWith('.offsetX') || path.endsWith('.offsetY') ||
             path === 'layers.labels.maxMagnitude' ||
             path === 'layers.stars.minRadius') {
    valid = isFiniteNumber
  }
  return { path, valid, reason }
}

const FIELD_RULES: FieldRule[] = []
collectRules('', DEFAULT_DISPLAY_CONFIG, FIELD_RULES)

/** 深拷贝默认值（纯数据，structuredClone 即可） */
function cloneDefaults(): DisplayConfig {
  return structuredClone(DEFAULT_DISPLAY_CONFIG)
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) =>
    isPlainObject(acc) ? acc[key] : undefined, obj)
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur = target
  for (let i = 0; i < keys.length - 1; i++) {
    cur = cur[keys[i]] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

/**
 * 解析显示配置：默认值与覆盖值逐叶子字段校验合并。
 * 任意字段缺失/非法都保留默认值，并在 notes 里记录原因。
 */
export function resolveDisplayConfig(override: unknown): {
  config: DisplayConfig
  source: DisplayConfigSource
  notes: DisplayConfigNote[]
} {
  const config = cloneDefaults()
  const notes: DisplayConfigNote[] = []

  if (override === undefined || override === null) {
    return { config, source: 'defaults', notes }
  }
  if (!isPlainObject(override)) {
    notes.push({ path: '(根对象)', reason: '覆盖配置不是 JSON 对象，已整体使用默认值' })
    return { config, source: 'defaults', notes }
  }

  for (const rule of FIELD_RULES) {
    const value = getPath(override, rule.path)
    if (value === undefined) continue // 字段未提供：部分覆盖属正常用法，安静回落
    if (!rule.valid(value)) {
      notes.push({ path: rule.path, reason: `${rule.reason}（收到 ${JSON.stringify(value)}），已改用默认值 ${JSON.stringify(getPath(config as unknown as Record<string, unknown>, rule.path))}` })
      continue
    }
    setPath(config as unknown as Record<string, unknown>, rule.path, value)
  }

  // 跨字段约束：字号上限不得小于任何基础字号
  const baseSizes = [config.layers.labels.baseSize, config.layers.constLabels.baseSize]
  if (config.fonts.maxSize < Math.max(...baseSizes)) {
    notes.push({
      path: 'fonts.maxSize',
      reason: `字号上限 ${config.fonts.maxSize} 小于基础字号 ${Math.max(...baseSizes)}，已恢复默认 ${DEFAULT_DISPLAY_CONFIG.fonts.maxSize}`
    })
    config.fonts.maxSize = DEFAULT_DISPLAY_CONFIG.fonts.maxSize
  }

  return { config, source: 'localStorage', notes }
}

/** 从 localStorage 读取覆盖配置，读取/解析失败时记录原因 */
function loadOverride(): { override: unknown; loadNotes: DisplayConfigNote[] } {
  const loadNotes: DisplayConfigNote[] = []
  if (typeof globalThis.localStorage === 'undefined') {
    return { override: undefined, loadNotes }
  }
  let raw: string | null = null
  try {
    raw = globalThis.localStorage.getItem(DISPLAY_CONFIG_STORAGE_KEY)
  } catch {
    loadNotes.push({ path: DISPLAY_CONFIG_STORAGE_KEY, reason: '浏览器禁止访问 localStorage，已使用内置默认值' })
    return { override: undefined, loadNotes }
  }
  if (raw === null) return { override: undefined, loadNotes }
  if (raw.trim() === '') {
    loadNotes.push({ path: DISPLAY_CONFIG_STORAGE_KEY, reason: 'localStorage 中的配置为空字符串，已使用内置默认值' })
    return { override: undefined, loadNotes }
  }
  try {
    return { override: JSON.parse(raw), loadNotes }
  } catch (e) {
    loadNotes.push({
      path: DISPLAY_CONFIG_STORAGE_KEY,
      reason: `JSON 解析失败（${e instanceof Error ? e.message : String(e)}），已使用内置默认值`
    })
    return { override: undefined, loadNotes }
  }
}

const loaded = loadOverride()
const resolved = resolveDisplayConfig(loaded.override)

/** 全应用共享的已解析显示配置（单一事实来源的运行时实例） */
export const displayConfig: DisplayConfig = resolved.config
export const displayConfigSource: DisplayConfigSource = resolved.source
/** 页面展示用的诊断信息（加载问题 + 字段非法回落原因） */
export const displayConfigNotes: DisplayConfigNote[] = [...loaded.loadNotes, ...resolved.notes]

// ---------------------------- 绘制 helper ----------------------------

/**
 * 设计像素 → 当前密度下的画布设备像素。
 * 设计像素以基准密度 BASE_PIXEL_RATIO 为参照；pixelRatio=2 时系数为 1，
 * 与收拢前逐像素一致，其它密度下与投影几何等比缩放。
 */
export function dp(designPixels: number): number {
  return designPixels * displayConfig.pixelRatio / BASE_PIXEL_RATIO
}

/** CSS 像素的画布（宽/高）→ 设备像素尺寸（收拢前写死 ×2） */
export function toDevicePixels(cssPixels: number): number {
  return cssPixels * displayConfig.pixelRatio
}

/** 鼠标事件坐标（相对画布的 CSS 像素）→ 画布设备像素 */
export function clientToDevice(offset: number): number {
  return offset * displayConfig.pixelRatio
}

/**
 * 随缩放变化的字号（设计像素）：基础字号 × zoom，并用全局字号上限截断。
 * 收拢前 zoom 档位为 0.3–3 且无显式上限，默认上限取满档星座字号 36，
 * 因此在该档位区间内结果与原来完全相同。绘制前经 dp() 换算到设备像素。
 */
export function scaledFontSize(baseSize: number, zoom: number): number {
  return Math.min(baseSize * zoom, displayConfig.fonts.maxSize)
}

/** 组装 Canvas font 字符串（字号入参为设计像素，内部换算到设备像素） */
export function fontString(bold: boolean, designSize: number): string {
  return `${bold ? 'bold ' : ''}${dp(designSize)}px ${displayConfig.fontFamily}`
}

/** 随缩放变化的长度（设计像素，如星座标签纵向偏移） */
export function scaledLength(baseLength: number, zoom: number): number {
  return baseLength * zoom
}
