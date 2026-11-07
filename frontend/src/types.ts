export interface Tracked<T> {
  enabled: boolean
}

export interface HeadlineSettings {
  enabled: boolean
  text: string
  fontFamily: string
  fontWeight: string
  size: number
  lineHeight: number
  letterSpacing: number
  italic: boolean
  align: 'left' | 'center' | 'right'
  color: string
  stroke: { enabled: boolean; width: number; color: string }
  shadow: { enabled: boolean; blur: number; offset: number; opacity: number }
  background: { enabled: boolean; color: string; padding: number }
  offsetX: number
  offsetY: number
}

export interface Crop {
  left: number
  right: number
  top: number
  bottom: number
}

export interface FootageSettings {
  scale: number
  offsetX: number
  offsetY: number
  crop: Crop
  brightness: number
  saturation: number
}

export interface SubtitleSettings {
  enabled: boolean
  mode: 'phrase' | 'word' | 'karaoke'
  fontFamily: string
  size: number
  color: string
  outlineWidth: number
  outlineColor: string
  shadow: boolean
  highlightKeywords: string
  highlightColor: string
  lineSpacing: number
  marginPct: number
  bottomGapPct: number
  uppercase: boolean
}

export interface LogoSettings {
  enabled: boolean
  path: string | null
  widthPct: number
  opacity: number
  offsetX: number
  offsetY: number
  rotation: number
}

export interface AudioSettings {
  volume: number
  fadeIn: number
  fadeOut: number
}

export interface ExportSettings {
  width: number
  fps: number | null
  crf: number
  preset: string
}

export interface Composition {
  topSafePct: number
  bottomSafePct: number
  headlineZonePct: number
  footageGapPct: number
  logoGapPct: number
}

export interface Settings {
  trimStart: number
  trimEnd: number | null
  composition: Composition
  headline: HeadlineSettings
  footage: FootageSettings
  subtitles: SubtitleSettings
  logo: LogoSettings
  audio: AudioSettings
  export: ExportSettings
}

export interface Project {
  id: string
  name: string
  source_path: string | null
  created_at: string
  updated_at: string
  settings: Settings
  transcript?: Transcript | null
  exports?: ExportRecord[]
  meta?: MediaMeta | null
}

export interface ExportRecord {
  id: string
  project_id: string
  project_name: string
  output_path: string
  created_at: string
  duration: number | null
  width: number | null
  height: number | null
  status: string
}

export interface MediaMeta {
  duration: number
  width: number
  height: number
  fps: number | null
  codec: string | null
  hasAudio: boolean
  audioCodec: string | null
  sizeBytes: number
  format: string | null
}

export interface TranscriptWord {
  word: string
  start: number
  end: number
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
  words: TranscriptWord[]
  wordsApprox?: boolean
}

export interface Transcript {
  language: string
  model: string
  offset: number
  wordsApprox: boolean
  segments: TranscriptSegment[]
  transcribedAt?: string
}

export interface Job {
  id: string
  kind: string
  label: string
  projectId: string | null
  status: 'running' | 'done' | 'failed' | 'cancelled' | 'cancelling'
  progress: number
  message: string
  result: any
  error: string | null
}

export interface SuggestedSegment {
  start: number
  end: number
  text: string
  score: number
}
