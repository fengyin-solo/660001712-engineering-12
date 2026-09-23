/**
 * 星图显示参数配置（唯一来源）
 *
 * 这里集中定义所有"怎么画"的默认值：像素密度、字号与字号上限、地平线比例，
 * 以及各绘制图层（背景 / 背景星点 / 网格 / 星座连线 / 恒星 / 星名 / 地平线 / 星座名）
 * 的默认样式。绘制代码（StarCanvas.vue、sky store）只从这里读取，不再各自写死常数。
 *
 * 覆盖方式：在 localStorage 的 `sky-display-config` 键写入一份 JSON（可只写部分字段）。
 * 字段缺失或取值非法时，逐项回退到本文件的默认值，回退原因会显示在页面上。
 */

export interface DisplayConfig {
  /** 像素密度：画布物理像素 = CSS 像素 × pixelRatio。高分大屏建议 2，低配设备可降到 1 */
  pixelRatio: number
  /** 地平线比例：地平圈半径 = (π/2) × 投影比例尺 × horizonRatio，恒星投影半径也用它 */
  horizonRatio: number
  /** 星名字号基准（px），实际字号 = 基准 × 缩放档位，并不超过 starFontSizeMax */
  starFontSize: number
  /** 星名字号上限（px），防止高缩放档位下字号无限放大 */
  starFontSizeMax: number
  /** 星座名字号基准（px），实际字号 = 基准 × 缩放档位，并不超过 constellationFontSizeMax */
  constellationFontSize: number
  /** 星座名字号上限（px） */
  constellationFontSizeMax: number
  /** 标签字体族 */
  labelFontFamily: string
  /** 星座名竖向偏移基准（px），实际偏移 = 基准 × 缩放档位 */
  constellationLabelOffsetY: number
  /** 各绘制图层的默认样式 */
  layers: {
    /** 背景层 */
    background: {
      /** 画布底色 */
      color: string
    }
    /** 背景随机星点层 */
    backgroundStars: {
      /** 星点数量 */
      count: number
      /** 单颗星点最大半径（px） */
      maxRadius: number
      /** 星点最大不透明度（0-1），实际不透明度在 0 ~ maxOpacity 间随机 */
      maxOpacity: number
      /** 星点颜色（rgb 三元组，用于拼 rgba 字符串） */
      rgb: string
    }
    /** 坐标网格层 */
    grid: {
      color: string
      lineWidth: number
    }
    /** 星座连线层 */
    constellationLines: {
      color: string
      lineWidth: number
    }
    /** 恒星本体层：半径 = max(minRadius, magBaseline - 星等) × 缩放档位 */
    star: {
      /** 恒星半径下限（px） */
      minRadius: number
      /** 星等基准，半径随 (magBaseline - 星等) 线性增大 */
      magBaseline: number
      /** 光晕半径倍数：光晕半径 = 恒星半径 × glowFactor */
      glowFactor: number
    }
    /** 星名标签层 */
    starLabel: {
      color: string
      /** 文字起点相对星点右缘的水平间距（px） */
      offsetX: number
      /** 文字起点相对星心的竖直偏移（px） */
      offsetY: number
      /** 只为亮于该星等的恒星标注星名 */
      maxMagnitude: number
    }
    /** 地平线层 */
    horizon: {
      color: string
      lineWidth: number
    }
    /** 星座名标签层 */
    constellationLabel: {
      color: string
      /** 文字起点相对星座首星的水平偏移（px） */
      offsetX: number
      /** 字重，如 'bold'、'normal' */
      fontWeight: string
    }
  }
}

/**
 * 默认显示配置。字号上限默认取"基准 × 最大缩放档位(3)"，
 * 因此在当前缩放范围（0.3 ~ 3）内渲染结果与未设上限完全一致。
 */
export const DEFAULT_DISPLAY_CONFIG: DisplayConfig = {
  pixelRatio: 2,
  horizonRatio: 0.45,
  starFontSize: 10,
  starFontSizeMax: 30,
  constellationFontSize: 12,
  constellationFontSizeMax: 36,
  labelFontFamily: 'system-ui',
  constellationLabelOffsetY: 15,
  layers: {
    background: { color: '#000814' },
    backgroundStars: { count: 300, maxRadius: 1.5, maxOpacity: 0.4, rgb: '255,255,255' },
    grid: { color: 'rgba(100,100,200,0.15)', lineWidth: 1 },
    constellationLines: { color: 'rgba(100,180,255,0.4)', lineWidth: 1.5 },
    star: { minRadius: 1, magBaseline: 5, glowFactor: 3 },
    starLabel: { color: 'rgba(200,200,255,0.7)', offsetX: 4, offsetY: 4, maxMagnitude: 2.5 },
    horizon: { color: 'rgba(0,200,100,0.3)', lineWidth: 2 },
    constellationLabel: { color: 'rgba(100,180,255,0.8)', offsetX: -20, fontWeight: 'bold' },
  },
}

/** 数值型配置项的合法取值范围（含端点），越界时回退为默认值 */
const NUMBER_RANGES: Record<string, { min: number; max: number; integer?: boolean }> = {
  'pixelRatio': { min: 0.5, max: 8 },
  'horizonRatio': { min: 0.05, max: 1 },
  'starFontSize': { min: 1, max: 100 },
  'starFontSizeMax': { min: 1, max: 200 },
  'constellationFontSize': { min: 1, max: 100 },
  'constellationFontSizeMax': { min: 1, max: 200 },
  'constellationLabelOffsetY': { min: 0, max: 100 },
  'layers.backgroundStars.count': { min: 0, max: 5000, integer: true },
  'layers.backgroundStars.maxRadius': { min: 0.1, max: 10 },
  'layers.backgroundStars.maxOpacity': { min: 0, max: 1 },
  'layers.grid.lineWidth': { min: 0.1, max: 20 },
  'layers.constellationLines.lineWidth': { min: 0.1, max: 20 },
  'layers.star.minRadius': { min: 0, max: 20 },
  'layers.star.magBaseline': { min: 0, max: 20 },
  'layers.star.glowFactor': { min: 1, max: 10 },
  'layers.starLabel.offsetX': { min: -100, max: 100 },
  'layers.starLabel.offsetY': { min: -100, max: 100 },
  'layers.starLabel.maxMagnitude': { min: -2, max: 10 },
  'layers.horizon.lineWidth': { min: 0.1, max: 20 },
  'layers.constellationLabel.offsetX': { min: -200, max: 200 },
}

export interface ResolvedDisplayConfig {
  /** 校验后的完整配置（非法/缺失字段已回退为默认值） */
  config: DisplayConfig
  /** 每条回退的原因说明，为空表示配置完全合法 */
  issues: string[]
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function cloneDefaults(): DisplayConfig {
  return JSON.parse(JSON.stringify(DEFAULT_DISPLAY_CONFIG))
}

function mergeNode(def: unknown, raw: unknown, path: string, issues: string[]): unknown {
  if (typeof def === 'number') {
    const range = NUMBER_RANGES[path]
    const ok = typeof raw === 'number' && Number.isFinite(raw)
      && (!range || (raw >= range.min && raw <= range.max))
      && (!range?.integer || Number.isInteger(raw))
    if (ok) return raw
    const why = raw === undefined
      ? '缺失'
      : typeof raw !== 'number' || !Number.isFinite(raw)
        ? `取值非法（${JSON.stringify(raw)}）`
        : `取值超出范围（${JSON.stringify(raw)}）`
    issues.push(`配置项 ${path} ${why}，已回退为默认值 ${def}`)
    return def
  }
  if (typeof def === 'string') {
    if (typeof raw === 'string' && raw.trim() !== '') return raw
    const why = raw === undefined ? '缺失' : `取值非法（${JSON.stringify(raw)}）`
    issues.push(`配置项 ${path} ${why}，已回退为默认值 "${def}"`)
    return def
  }
  // 对象节点：整组缺失或非法时整组回退，否则逐字段合并
  if (raw === undefined) {
    issues.push(`配置组 ${path} 缺失，该组已回退为默认值`)
    return JSON.parse(JSON.stringify(def))
  }
  if (!isPlainObject(raw)) {
    issues.push(`配置组 ${path} 取值非法（${JSON.stringify(raw)}），该组已回退为默认值`)
    return JSON.parse(JSON.stringify(def))
  }
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(def as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key
    out[key] = mergeNode((def as Record<string, unknown>)[key], raw[key], childPath, issues)
  }
  return out
}

/**
 * 校验并合并显示配置。
 * @param raw 外部提供的配置（通常是 JSON.parse 的结果）；传 undefined/null 表示无覆盖，直接返回默认值
 * @returns 完整配置 + 回退原因列表
 */
export function resolveDisplayConfig(raw: unknown): ResolvedDisplayConfig {
  const issues: string[] = []
  if (raw === undefined || raw === null) {
    return { config: cloneDefaults(), issues }
  }
  if (!isPlainObject(raw)) {
    issues.push('显示配置不是有效的 JSON 对象，已整体回退为默认配置')
    return { config: cloneDefaults(), issues }
  }
  const config = mergeNode(DEFAULT_DISPLAY_CONFIG, raw, '', issues) as DisplayConfig

  // 跨字段约束：字号上限不能小于基准字号
  if (config.starFontSizeMax < config.starFontSize) {
    issues.push(`配置项 starFontSizeMax（${config.starFontSizeMax}）小于 starFontSize（${config.starFontSize}），已回退为默认值 ${DEFAULT_DISPLAY_CONFIG.starFontSizeMax}`)
    config.starFontSizeMax = Math.max(DEFAULT_DISPLAY_CONFIG.starFontSizeMax, config.starFontSize)
  }
  if (config.constellationFontSizeMax < config.constellationFontSize) {
    issues.push(`配置项 constellationFontSizeMax（${config.constellationFontSizeMax}）小于 constellationFontSize（${config.constellationFontSize}），已回退为默认值 ${DEFAULT_DISPLAY_CONFIG.constellationFontSizeMax}`)
    config.constellationFontSizeMax = Math.max(DEFAULT_DISPLAY_CONFIG.constellationFontSizeMax, config.constellationFontSize)
  }
  return { config, issues }
}
