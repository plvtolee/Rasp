import React, { createContext, useCallback, useContext, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export type ToastKind = 'ok' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

const ToastCtx = createContext<(kind: ToastKind, title: string, body?: string) => void>(() => {})

export function useToast() {
  return useContext(ToastCtx)
}

export function toast_accent(kind: ToastKind) {
  return kind === 'ok' ? 'bg-lime' : kind === 'error' ? 'bg-tang' : 'bg-cobalt'
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const seq = useRef(0)

  const push = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-3), { id, kind, title, body }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4200)
  }, [])

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[340px] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="panel pointer-events-auto flex items-stretch">
            <div className={`w-2.5 shrink-0 ${toast_accent(t.kind)}`} />
            <div className="flex min-w-0 flex-1 items-start gap-2 p-3">
              <div className="mt-0.5 shrink-0">
                {t.kind === 'ok' && <CheckCircle2 size={15} strokeWidth={2.5} />}
                {t.kind === 'error' && <AlertTriangle size={15} strokeWidth={2.5} />}
                {t.kind === 'info' && <Info size={15} strokeWidth={2.5} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold uppercase tracking-wide">{t.title}</div>
                {t.body && <div className="mt-0.5 break-words text-[12px] leading-snug text-ink/70">{t.body}</div>}
              </div>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
                aria-label="dismiss"
              >
                <X size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
