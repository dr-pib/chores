'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface NavBarProps {
  userName: string
  userRole: string
}

const BASE_LINKS = [
  { href: '/setup', label: 'Setup' },
  { href: '/my-chores', label: 'My Chores' },
  { href: '/log', label: 'Roster' },
  { href: '/chores', label: "All Chores" },
]

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
const BADGE_COLORS: Record<string, string> = {
  blue: 'bg-cyan-500/20 text-cyan-300',
  amber: 'bg-amber-500/20 text-amber-300',
  red: 'bg-red-500/20 text-red-300',
}

interface BadgeState {
  myChores: { count: number; color: keyof typeof BADGE_COLORS | null }
  everyoneChores: { count: number; color: keyof typeof BADGE_COLORS | null }
}

function NavBadge({ count, color }: { count: number; color: keyof typeof BADGE_COLORS | null }) {
  if (!color || count <= 0) return null
  return (
    <span className={`ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[9px] font-mono font-semibold leading-none ${BADGE_COLORS[color]}`}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function NavBar({ userName, userRole }: NavBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [badges, setBadges] = useState<BadgeState | null>(null)

  const links = SUPERVISOR_ROLES.includes(userRole)
    ? [...BASE_LINKS, { href: '/crew-posts', label: 'Crews' }, { href: '/employees', label: 'Employees' }, { href: '/chore-templates', label: 'Chores' }]
    : BASE_LINKS

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  useEffect(() => {
    let ignore = false
    async function loadBadges() {
      try {
        const res = await fetch('/api/badges', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json()
        if (!ignore) setBadges(data)
      } catch {
        if (!ignore) setBadges(null)
      }
    }
    loadBadges()
    return () => { ignore = true }
  }, [pathname])

  function badgeFor(href: string) {
    if (href === '/my-chores') return badges?.myChores ?? null
    if (href === '/chores') return badges?.everyoneChores ?? null
    return null
  }

  const isActive = (href: string) => pathname === href || (href !== '/setup' && pathname.startsWith(href))

  return (
    <nav className="bg-[#0a0b0e] border-b border-[#1e2028] sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-4 flex items-stretch justify-between h-10">
        {/* Brand */}
        <Link href="/setup" className="flex items-center pr-4 border-r border-[#1e2028] mr-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.15em] text-cyan-400 uppercase">
            EMS/CHORES
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-stretch flex-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex items-center px-3 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors border-b-2 ${
                isActive(l.href)
                  ? 'text-cyan-400 border-cyan-400'
                  : 'text-zinc-500 border-transparent hover:text-zinc-200'
              }`}
            >
              {l.label}
              <NavBadge count={badgeFor(l.href)?.count ?? 0} color={badgeFor(l.href)?.color ?? null} />
            </Link>
          ))}
        </div>

        {/* User info + signout */}
        <div className="hidden md:flex items-center gap-3 pl-4 border-l border-[#1e2028] ml-2">
          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wide">
            {userName.split(' ')[0]} · <span className="text-zinc-600">{userRole}</span>
          </span>
          <button
            onClick={logout}
            className="font-mono text-[9px] tracking-[0.1em] uppercase text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden flex items-center text-zinc-500 hover:text-zinc-200"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen
              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-[#1e2028] bg-[#0a0b0e] px-4 py-2 space-y-0.5">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center px-2 py-1.5 font-mono text-[10px] tracking-[0.1em] uppercase transition-colors ${
                isActive(l.href) ? 'text-cyan-400' : 'text-zinc-500 hover:text-zinc-200'
              }`}
            >
              {l.label}
              <NavBadge count={badgeFor(l.href)?.count ?? 0} color={badgeFor(l.href)?.color ?? null} />
            </Link>
          ))}
          <div className="pt-2 mt-1 border-t border-[#1e2028] flex items-center justify-between">
            <span className="font-mono text-[10px] text-zinc-600 uppercase tracking-wide">{userName} · {userRole}</span>
            <button onClick={logout} className="font-mono text-[9px] uppercase tracking-wide text-zinc-600 hover:text-red-400 transition-colors">
              Sign Out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
