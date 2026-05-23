'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'

interface CrewPost {
  id: number
  name: string
  default_start_time: string
  default_shift_length_hours: number
  station: { id: number; name: string }
  default_unit: { id: number; unit_number: number; unit_name: string | null } | null
  bays: { id: number; bay_label: string; sort_order: number }[]
}

function fmt12(time: string) {
  const [h, m] = time.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function CrewPostsPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [posts, setPosts] = useState<CrewPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/crew-posts').then(r => r.json()),
    ]).then(([meData, postsData]) => {
      if (!meData.user) { router.push('/login'); return }
      if (!['Dom', 'Admin', 'Supervisor'].includes(meData.user.role)) { router.push('/setup'); return }
      setUser(meData.user)
      setPosts(Array.isArray(postsData) ? postsData : [])
      setLoading(false)
    })
  }, [router])

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  if (!user) return null

  // Group by station
  const byStation: Record<string, CrewPost[]> = {}
  for (const p of posts) {
    const key = p.station.name
    if (!byStation[key]) byStation[key] = []
    byStation[key].push(p)
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-zinc-100">Crews</h1>
          <p className="mt-1 text-sm text-zinc-500">{posts.length} crew posts · click a row to edit defaults</p>
        </div>

        <div className="space-y-6">
          {Object.entries(byStation).map(([station, stationPosts]) => (
            <div key={station}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{station}</h2>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
                {stationPosts.map(post => (
                  <Link
                    key={post.id}
                    href={`/crew-posts/${post.id}/edit`}
                    className="flex items-center gap-4 px-5 py-2.5 hover:bg-zinc-800/60 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-zinc-100">{post.name}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-xs text-zinc-500">
                      <span>{fmt12(post.default_start_time)}</span>
                      <span>{post.default_shift_length_hours}h</span>
                      {post.default_unit && (
                        <span className="text-zinc-400">Unit {post.default_unit.unit_number}</span>
                      )}
                      {post.bays.length > 0 && (
                        <span className="text-zinc-600">
                          Bay {post.bays.map(b => b.bay_label).join(', ')}
                        </span>
                      )}
                      <svg className="w-4 h-4 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
