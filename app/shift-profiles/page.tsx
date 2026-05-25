'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import ShiftProfileEditPanel from '@/components/ShiftProfileEditPanel'
import { compareShiftProfiles } from '@/lib/shift-profiles'
import { isSupervisorRole } from '@/lib/roles'

interface ShiftProfile {
  id: number
  name: string
  default_start_time: string
  default_shift_length_hours: number
  station: { id: number; name: string }
  default_unit: { id: number; unit_number: number; unit_name: string | null } | null
  bays: { id: number; bay_label: string; sort_order: number }[]
}

export default function ShiftProfilesPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ id: number; name: string; role: string } | null>(null)
  const [posts, setPosts] = useState<ShiftProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/shift-profiles').then(r => r.json()),
    ]).then(([meData, postsData]) => {
      if (!meData.user) { router.push('/login'); return }
      if (!isSupervisorRole(meData.user.role)) { router.push('/setup'); return }
      setUser(meData.user)
      setPosts(Array.isArray(postsData) ? postsData : [])
      setLoading(false)
    })
  }, [router])

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  if (!user) return null

  const sortedPosts = [...posts].sort(compareShiftProfiles)

  function handleRowClick(id: number) {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      setSelectedId(id)
    } else {
      router.push(`/shift-profiles/${id}/edit`)
    }
  }

  return (
    <div className="bg-zinc-950 min-h-screen">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="lg:flex lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden">

        {/* Left: list */}
        <div className="lg:w-72 lg:flex-shrink-0 lg:border-r lg:border-zinc-800 lg:overflow-y-auto">
          <div className="px-4 py-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-zinc-100">Shift Profiles</h1>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900 divide-y divide-zinc-800 overflow-hidden">
              {sortedPosts.map(post => (
                <button
                  key={post.id}
                  onClick={() => handleRowClick(post.id)}
                  className={`w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/60 transition-colors ${selectedId === post.id ? 'bg-zinc-800/80 border-l-2 border-blue-500' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-100 truncate">{post.name}</div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-zinc-600 shrink-0 lg:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: detail panel — large screens only */}
        <div className="hidden lg:flex lg:flex-1 lg:overflow-y-auto">
          {selectedId ? (
            <ShiftProfileEditPanel key={selectedId} postId={selectedId} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
              Click a shift profile on the left to edit.
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
