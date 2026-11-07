import { Link, NavLink } from 'react-router-dom'
import { Download, Film, LayoutGrid, Moon, Settings as SettingsIcon, Sun } from 'lucide-react'
import { useJobs } from '../hooks/useJobs'
import { useTheme } from '../theme'

const items = [
  { to: '/', label: 'DASH', icon: LayoutGrid, end: true },
  { to: '/new', label: 'NEW', icon: Film },
  { to: '/exports', label: 'OUT', icon: Download },
  { to: '/settings', label: 'SET', icon: SettingsIcon },
]

export default function NavRail() {
  const jobs = useJobs()
  const { theme, toggle } = useTheme()
  const busy = jobs.some((j) => j.status === 'running')
  const running = jobs.filter((j) => j.status === 'running')[0]

  return (
    <>
      {/* desktop rail */}
      <aside className="sticky top-0 z-40 hidden h-screen w-[84px] shrink-0 flex-col justify-between border-r-2 border-ink bg-ink text-paper md:flex">
        <div>
          <Link to="/" className="flex h-[84px] items-center justify-center border-b-2 border-paper/25">
            <span className="font-display text-[34px] leading-none text-lime">R</span>
            <span className="mb-3 font-mono text-[9px] font-bold text-paper/50">®</span>
          </Link>
          <nav className="flex flex-col">
            {items.map((it) => (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.end}
                className={({ isActive }) =>
                  `group flex flex-col items-center gap-1 border-b border-paper/15 py-4 transition-colors ${
                    isActive ? 'bg-lime text-ink' : 'hover:bg-paper/10'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <it.icon size={17} strokeWidth={2.4} className={isActive ? 'text-ink' : 'text-paper/80'} />
                    <span className={`font-mono text-[9px] font-bold tracking-[0.16em] ${isActive ? 'text-ink' : 'text-paper/60'}`}>{it.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="border-t border-paper/15 p-2">
          <button
            onClick={toggle}
            className="flex w-full flex-col items-center gap-1.5 py-2 text-paper/60 transition-colors hover:text-paper"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            <span className="font-mono text-[8px] uppercase tracking-widest">{theme === 'dark' ? 'LIGHT' : 'DARK'}</span>
          </button>
          <div className="flex flex-col items-center gap-1.5 py-2" title={busy ? running?.label : 'idle'}>
            <span className={`inline-block h-2 w-2 ${busy ? 'animate-workdot bg-lime' : 'bg-paper/30'}`} />
            <span className="font-mono text-[8px] uppercase tracking-widest text-paper/40">{busy ? 'WORK' : 'IDLE'}</span>
          </div>
        </div>
      </aside>

      {/* mobile bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b-2 border-ink bg-ink px-3 py-2 text-paper md:hidden">
        <Link to="/" className="flex items-baseline gap-1">
          <span className="font-display text-2xl leading-none text-lime">RASP</span>
          <span className="font-mono text-[9px] text-paper/50">®</span>
        </Link>
        <nav className="flex gap-1">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end}
              className={({ isActive }) => `grid h-8 w-9 place-items-center border border-paper/25 ${isActive ? 'bg-lime text-ink' : 'text-paper/70'}`}
            >
              <it.icon size={14} />
            </NavLink>
          ))}
          <button
            onClick={toggle}
            className="grid h-8 w-9 place-items-center border border-paper/25 text-paper/70"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </nav>
      </header>
    </>
  )
}