/**
 * 赤道坐标 → 地平坐标（Alt/Az）投影的纯函数实现。
 * 与 Vue/Pinia 无关，既被 store 复用，也供脚本直接验证投影位置。
 */
import { displayConfig } from '../config/display'

/** 地平不可见（低于地平线）时投影返回的哨兵坐标 */
export const BELOW_HORIZON: [number, number] = [-999, -999]

/**
 * 角距离（弧度）→ 像素半径。
 * 天顶(π/2 角距)映射到 短边半径 × horizonRatio；星点投影与地平线圆环
 * 必须共用这一份映射，星点才能落在正确的地平高度上。
 */
export function skyRadius(angle: number, scale: number): number {
  return angle * scale * displayConfig.horizonRatio
}

/** 地平线圆环的像素半径（alt = 0，角距 π/2） */
export function horizonRadius(scale: number): number {
  return skyRadius(Math.PI / 2, scale)
}

/**
 * 赤道坐标投影为画布坐标（设备像素坐标系，cx/cy/scale 均为设备像素）。
 * @param ra  赤经（小时，0–24）
 * @param dec 赤纬（度，-90–90）
 * @param latitude 观测点纬度（度）
 * @param lst 当地恒星时（小时）
 */
export function projectEquatorial(
  ra: number, dec: number,
  latitude: number, lst: number,
  cx: number, cy: number, scale: number,
  panX = 0, panY = 0
): [number, number] {
  const ha = (lst - ra) * 15 * Math.PI / 180
  const decRad = dec * Math.PI / 180
  const latRad = latitude * Math.PI / 180

  const alt = Math.asin(Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(ha))
  const az = Math.atan2(-Math.cos(decRad) * Math.sin(ha), Math.sin(decRad) * Math.cos(latRad) - Math.cos(decRad) * Math.sin(latRad) * Math.cos(ha))

  if (alt < -0.1) return BELOW_HORIZON // 低于地平裁剪阈，保留原有行为

  const r = skyRadius(Math.PI / 2 - alt, scale)
  const x = cx + panX + r * Math.sin(az)
  const y = cy + panY - r * Math.cos(az)
  return [x, y]
}
