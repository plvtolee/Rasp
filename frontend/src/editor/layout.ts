/* Mirrors backend/composition/layout.py exactly. py = python source of truth. */
import { Settings } from '../types'

export function even(n: number): number {
  const v = Math.round(n)
  return v - (v % 2)
}

export interface PreviewLayout {
  W: number // canvas width basis (1080)
  H: number
  scale: number // preview scale (canvas px -> screen px)
  topSafe: number
  bottomSafeTop: number
  headlineY: number
  headlineZoneH: number
  footageX: number
  footageY: number
  footageW: number
  footageH: number
  logoX: number
  logoY: number
  logoW: number
  logoH: number
  subtitleMH: number
  subtitleMV: number
}

export function computeLayout(settings: Settings, srcW: number, srcH: number, previewW: number): PreviewLayout {
  const s = 1 // canvas-space factor (all numbers in 1080-canvas px)
  const W = 1080
  const H = even(W * 16 / 9)
  const comp = settings.composition

  const topSafe = Math.round(H * comp.topSafePct / 100)
  const bottomSafe = Math.round(H * comp.bottomSafePct / 100)
  const bottomSafeTop = H - bottomSafe

  const headlineEnabled = settings.headline.enabled
  const headlineZoneH = headlineEnabled ? Math.round(H * comp.headlineZonePct / 100) : 0
  const headlineY = topSafe + Math.round(H * 0.006)
  const footageGap = headlineEnabled ? Math.round(H * comp.footageGapPct / 100) : Math.round(H * 0.008)

  const crop = settings.footage.crop
  const cw = Math.max(2, srcW * (1 - crop.left / 100 - crop.right / 100))
  const ch = Math.max(2, srcH * (1 - crop.top / 100 - crop.bottom / 100))
  const scale = Math.max(0.05, settings.footage.scale)
  const footageW = even(W * scale)
  const footageH = even(footageW * ch / cw)

  const footageY =
    headlineY + headlineZoneH + footageGap + Math.round(H * settings.footage.offsetY / 100)
  const footageX = even((W - footageW) / 2 + W * settings.footage.offsetX / 100)
  const footageBottom = footageY + footageH

  const logoEnabled = settings.logo.enabled && !!settings.logo.path
  const logoGap = Math.round(H * comp.logoGapPct / 100)
  const logoW = logoEnabled ? even(W * settings.logo.widthPct / 100) : 0
  const logoH = Math.round(logoW || 1) // aspect handled by element + aspectRatio css
  const logoY = footageBottom + logoGap + Math.round(H * settings.logo.offsetY / 100)
  const logoX = even((W - logoW) / 2 + W * settings.logo.offsetX / 100)

  return {
    W, H,
    scale: previewW / W,
    topSafe,
    bottomSafeTop,
    headlineY,
    headlineZoneH,
    footageX, footageY, footageW, footageH,
    logoX, logoY, logoW, logoH,
    subtitleMH: Math.round(W * settings.subtitles.marginPct / 100),
    subtitleMV: Math.round(footageH * settings.subtitles.bottomGapPct / 100),
  }
}

/* canvas-space -> style mapping helper */
export function px(l: PreviewLayout, v: number): number {
  return v * l.scale
}
