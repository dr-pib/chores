'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import NavBar from '@/components/NavBar'
import { lastFirstName, compareEmployeesByLastName } from '@/lib/employees'
import { PerformanceStats, trendArrow, formatRate } from '@/lib/performance'

interface EmployeePerf {
  employee_id: number
  name: string
  licensure_level: string
  role: string
  status: string
  windows: PerformanceStats
}

type SortKey = 'd30' | 'd60'

function TrendChip({ d60, d30 }: { d60: number | null; d30: number | null }) {
  const arrow = trendArrow(d60, d30)
  const color = arrow === '↑' ? 'text-green-400' : arrow === '↓' ? 'text-red-400' : 'text-zinc-600'
  return <span className={`text-sm font-medium ${color}`}>{arrow}</span>
}

export default function ReportPage() {
  const router = useRouter()
  const [user, setUser] = useState<{ name: string; role: string } | null>(null)
  const [data, setData] = useState<EmployeePerf[]>([])
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('d30')

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/performance/all').then(r => r.json()),
    ]).then(([meData, perfData]) => {
      if (!meData.user) { router.push('/login'); return }
      if (!['Dom', 'Admin', 'Supervisor'].includes(meData.user.role)) { router.push('/setup'); return }
      setUser(meData.user)
      setData(Array.isArray(perfData) ? perfData : [])
      setLoading(false)
    })
  }, [router])

  const sorted = useMemo(() => {
    const active = data.filter(e => e.status === 'Active')
    const prn = data.filter(e => e.status === 'PRN')

    function rankEmployee(e: EmployeePerf) {
      const rate = sortKey === 'd30' ? e.windows.d30.rate : e.windows.d60.rate
      // No-data rows go to the bottom; otherwise ascending (worst first)
      if (rate === null) return 2
      return rate
    }

    const sortGroup = (group: EmployeePerf[]) =>
      [...group].sort((a, b) => {
        const diff = rankEmployee(a) - rankEmployee(b)
        if (diff !== 0) return diff
        return compareEmployeesByLastName(a, b)
      })

    return { active: sortGroup(active), prn: sortGroup(prn) }
  }, [data, sortKey])

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }
  if (!user) return null

  function renderGroup(label: string, group: EmployeePerf[]) {
    if (group.length === 0) return null
    return (
      <div key={label}>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</h2>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden divide-y divide-zinc-800">
          {group.map(emp => (
            <Link
              key={emp.employee_id}
              href={`/report/${emp.employee_id}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800/60 transition-colors"
            >
              <div className="w-52 shrink-0">
                <span className="text-sm text-zinc-100">{lastFirstName(emp.name)}</span>
                <span className="ml-2 text-xs text-zinc-500">{emp.licensure_level}</span>
              </div>
              <div className={`w-16 shrink-0 text-sm font-medium ${sortKey === 'd60' ? 'text-zinc-100' : 'text-zinc-400'}`}>
                {formatRate(emp.windows.d60.rate)}
              </div>
              <div className={`w-16 shrink-0 text-sm font-medium ${sortKey === 'd30' ? 'text-zinc-100' : 'text-zinc-400'}`}>
                {formatRate(emp.windows.d30.rate)}
              </div>
              <div className="w-16 shrink-0 text-sm text-zinc-400 font-medium">
                {formatRate(emp.windows.last_shift?.rate ?? null)}
              </div>
              <div className="w-14 shrink-0 text-xs text-zinc-500">
                {emp.windows.d60.shifts} shift{emp.windows.d60.shifts !== 1 ? 's' : ''}
              </div>
              <div className="w-8 shrink-0">
                <TrendChip d60={emp.windows.d60.rate} d30={emp.windows.d30.rate} />
              </div>
              <svg className="ml-auto w-3.5 h-3.5 text-zinc-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-100">Performance Report</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Chore completion rates — last 60 days. Sorted worst first.</p>
          </div>
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1 shrink-0">
            <button
              onClick={() => setSortKey('d30')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${sortKey === 'd30' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              30d
            </button>
            <button
              onClick={() => setSortKey('d60')}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${sortKey === 'd60' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              60d
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 px-4 pb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <div className="w-52 shrink-0">Employee</div>
          <div className="w-16 shrink-0">60d</div>
          <div className="w-16 shrink-0">30d</div>
          <div className="w-16 shrink-0">Last</div>
          <div className="w-14 shrink-0">Shifts</div>
          <div className="w-8 shrink-0">Trend</div>
        </div>

        <div className="space-y-6">
          {renderGroup('Active', sorted.active)}
          {renderGroup('PRN', sorted.prn)}
        </div>

        {data.length === 0 && (
          <div className="text-center py-16 text-zinc-500">No shift history in the last 60 days.</div>
        )}
      </div>
    </div>
  )
}
