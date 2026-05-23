'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface NavBarProps {
  userName: string
  userRole: string
}

const BASE_LINKS = [
  { href: '/setup', label: 'Shift Setup' },
  { href: '/my-chores', label: 'My Chores' },
  { href: '/log', label: "Today's Roster" },
  { href: '/chores', label: "Everyone's Chores" },
]

const SUPERVISOR_ROLES = ['Dom', 'Admin', 'Supervisor']
const BADGE_COLORS: Record<string, string> = {
  blue: 'bg-blue-600 text-white',
  amber: 'bg-amber-400 text-zinc-950',
  red: 'bg-red-500 text-white',
}

interface BadgeState {
  myChores: { count: number; color: keyof typeof BADGE_COLORS | null }
  everyoneChores: { count: number; color: keyof typeof BADGE_COLORS | null }
}

function NavBadge({ count, color }: { count: number; color: keyof typeof BADGE_COLORS | null }) {
  if (!color || count <= 0) return null

  return (
    <span className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none ${BADGE_COLORS[color]}`}>
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

  function isActive(href: string) {
    if (href === '/log') return pathname === '/log'
    if (href === '/my-chores') return pathname === '/my-chores' || pathname.startsWith('/log/')
    return pathname.startsWith(href)
  }

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
    return () => {
      ignore = true
    }
  }, [pathname])

  function badgeFor(href: string) {
    if (href === '/my-chores') return badges?.myChores ?? null
    if (href === '/chores') return badges?.everyoneChores ?? null
    return null
  }

  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link href="/setup" className="text-blue-600 font-bold text-lg tracking-tight">
          EMS Chores
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                isActive(l.href)
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <span className="inline-flex items-center">
                {l.label}
                <NavBadge count={badgeFor(l.href)?.count ?? 0} color={badgeFor(l.href)?.color ?? null} />
              </span>
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span className="text-zinc-400 text-sm">
            {userName} <span className="text-zinc-600 text-xs ml-1">{userRole}</span>
          </span>
          <button
            onClick={logout}
            className="text-sm text-zinc-400 hover:text-zinc-100 px-2 py-1 rounded hover:bg-zinc-800 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-zinc-400 hover:text-zinc-100"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-900 px-4 pb-4 pt-2 space-y-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`block px-3 py-2 rounded text-sm font-medium ${
                isActive(l.href)
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
              }`}
            >
              <span className="inline-flex items-center">
                {l.label}
                <NavBadge count={badgeFor(l.href)?.count ?? 0} color={badgeFor(l.href)?.color ?? null} />
              </span>
            </Link>
          ))}
          <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
            <span className="text-zinc-400 text-sm">{userName} · {userRole}</span>
            <button onClick={logout} className="text-sm text-red-400 hover:text-red-300">
              Sign out
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
