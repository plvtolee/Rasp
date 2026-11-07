import React from 'react'
import { LucideIcon } from 'lucide-react'

/* ---------- structural ---------- */

export function Panel({
  label,
  accent = 'lime',
  right,
  children,
  className = '',
}: {
  label: string
  accent?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="flex items-center justify-between border-b-2 border-ink bg-paper px-3 py-2">
        <div className="flex items-center gap-2">
          <span className={`sec-dot ${accent === 'lime' ? 'bg-lime' : accent === 'cobalt' ? 'bg-cobalt' : accent === 'tang' ? 'bg-tang' : accent === 'bubble' ? 'bg-bubble' : accent === 'acid' ? 'bg-acid' : 'bg-ink'}`} />
          <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.2em]">{label}</h3>
        </div>
        {right}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="label mb-1 flex items-baseline justify-between">
        <span>{label}</span>
        {hint && <span className="text-ink/40 normal-case">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  unit = '',
  hint,
  accent = '#C6FF36',
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  unit?: string
  hint?: string
  accent?: string
}) {
  return (
    <div>
      <div className="label mb-1 flex items-baseline justify-between gap-1">
        <span className="truncate">{label}</span>
        <span className="shrink-0 font-mono text-[11px] font-bold not-italic text-ink">
          {Math.round(value * 100) / 100}
          {unit}
        </span>
      </div>
      {hint && <div className="mb-1 -mt-0.5 font-mono text-[9px] lowercase text-ink/35">{hint}</div>}
      <input
        type="range"
        className="w-full"
        style={{ accentColor: accent }}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  )
}

export function Toggle({ label, checked, onChange, accent = 'lime' }: { label: string; checked: boolean; onChange: (v: boolean) => void; accent?: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between border-2 border-ink px-2.5 py-1.5 transition-colors ${
        checked ? `${accent === 'lime' ? 'bg-lime' : accent === 'cobalt' ? 'bg-cobalt text-white' : accent === 'tang' ? 'bg-tang' : 'bg-bubble'} font-bold` : 'bg-card'
      }`}
    >
      <span className="text-[12px] font-bold uppercase tracking-wide">{label}</span>
      <span className={`flex h-4 w-8 items-center border border-ink bg-card ${checked ? 'justify-end' : 'justify-start'}`}>
        <span className="h-3 w-3 bg-ink" />
      </span>
    </button>
  )
}

export function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select className="field cursor-pointer appearance-none pr-7" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function SegButton<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <div className="flex border-2 border-ink bg-card">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`flex-1 px-1.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wide transition-colors ${
              value === o.value ? 'bg-ink text-lime' : 'hover:bg-paper'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function MonoStat({ k, v, accent }: { k: string; v: React.ReactNode; accent?: 'lime' | 'tang' | 'acid' | 'bubble' | 'cobalt' }) {
  const bg = accent === 'tang' ? 'bg-tang' : accent === 'lime' ? 'bg-lime' : accent === 'acid' ? 'bg-acid' : accent === 'bubble' ? 'bg-bubble' : accent === 'cobalt' ? 'bg-cobalt text-white' : ''
  return (
    <div className={`border-2 border-ink px-2 py-1 ${bg || 'bg-card shadow-brutal-sm'}`}>
      <div className={`label leading-none ${accent === 'cobalt' ? 'text-white/60' : ''}`}>{k}</div>
      <div className="mt-0.5 truncate font-mono text-[12px] font-bold leading-tight">{v}</div>
    </div>
  )
}

export function Spinner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[12px] font-bold uppercase">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="inline-block h-2.5 w-2.5 animate-workdot border-2 border-ink"
            style={{ animationDelay: `${i * 0.16}s`, backgroundColor: ['#C6FF36', '#FF58A8', '#3155FF'][i] }}
          />
        ))}
      </span>
      {children}
    </div>
  )
}

export function IconBtn({ icon: Icon, title, onClick, danger }: { icon: LucideIcon; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button className="btn btn-xs !p-1.5" style={danger ? { color: '#FF6633' } : undefined} title={title} onClick={onClick}>
      <Icon size={14} strokeWidth={2.5} />
    </button>
  )
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="border-2 border-dashed border-ink/30 px-3 py-6 text-center font-mono text-[11px] uppercase tracking-widest text-ink/40">
      {text}
    </div>
  )
}
