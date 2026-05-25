'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import NavBar from '@/components/NavBar'
import { compareEmployeesByLastName, formatEmployeeDropdown } from '@/lib/employees'
import { PerformanceStats, trendArrow, formatRate } from '@/lib/performance'

interface UserProfile {
  id: number
  name: string
  emt_number: string
  licensure_level: string
  role: string
  default_shift_profile_id: number | null
  default_partner_id: number | null
  default_shift_length_hours: number | null
  birthday_month: number | null
  birthday_day: number | null
  personal_cell: string | null
  notification_preference: string | null
  reminder_hours_before_shift_end: number | null
}

interface ShiftProfile { id: number; name: string; station: { name: string } }
interface EmployeeOption { id: number; name: string; licensure_level: string; status: string; role: string }

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
  { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
  { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
]

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const selectClass =
  'px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'
const inputClass =
  'px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [shiftProfiles, setShiftProfiles] = useState<ShiftProfile[]>([])
  const [employees, setEmployees] = useState<EmployeeOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null)

  const [postId, setPostId] = useState<number | ''>('')
  const [partnerId, setPartnerId] = useState<number | ''>('')
  const [shiftLength, setShiftLength] = useState<number | ''>('')
  const [birthdayMonth, setBirthdayMonth] = useState<number | ''>('')
  const [birthdayDay, setBirthdayDay] = useState<number | ''>('')
  const [personalCell, setPersonalCell] = useState('')
  const [notificationPref, setNotificationPref] = useState('none')
  const [reminderHours, setReminderHours] = useState<number | ''>('')

  useEffect(() => {
    Promise.all([
      fetch('/api/me').then(r => r.json()),
      fetch('/api/shift-profiles').then(r => r.json()),
      fetch('/api/employees').then(r => r.json()),
      fetch('/api/performance').then(r => r.json()),
    ]).then(([meData, postsData, empsData, perfData]) => {
      if (!meData.user) { router.push('/login'); return }
      const u: UserProfile = meData.user
      setUser(u)
      setShiftProfiles(Array.isArray(postsData) ? postsData : [])
      setEmployees(Array.isArray(empsData) ? empsData : [])
      setPostId(u.default_shift_profile_id ?? '')
      setPartnerId(u.default_partner_id ?? '')
      setShiftLength(u.default_shift_length_hours ?? '')
      setBirthdayMonth(u.birthday_month ?? '')
      setBirthdayDay(u.birthday_day ?? '')
      setPersonalCell(u.personal_cell ?? '')
      setNotificationPref(u.notification_preference ?? 'none')
      setReminderHours(u.reminder_hours_before_shift_end ?? '')
      if (perfData?.windows) setPerfStats(perfData.windows)
      setLoading(false)
    })
  }, [router])

  async function handleSave() {
    setSaveState('saving')
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        default_shift_profile_id: postId || null,
        default_partner_id: partnerId || null,
        default_shift_length_hours: shiftLength || null,
        birthday_month: birthdayMonth || null,
        birthday_day: birthdayDay || null,
        personal_cell: personalCell || null,
        notification_preference: notificationPref,
        reminder_hours_before_shift_end: reminderHours || null,
      }),
    })
    if (res.ok) {
      const data = await res.json()
      setUser(data.user)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } else {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading…</div>
  }
  if (!user) return null

  const partnerOptions = employees
    .filter(e => e.status === 'Active' && e.role !== 'Admin' && e.id !== user.id)
    .sort(compareEmployeesByLastName)

  return (
    <div className="min-h-screen bg-zinc-950">
      <NavBar userName={user.name} userRole={user.role} />
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-zinc-100">My Profile</h1>
          <div className="flex items-center gap-3">
            {saveState === 'saving' && <span className="text-zinc-500 text-sm">Saving…</span>}
            {saveState === 'saved' && <span className="text-green-400 text-sm">Saved</span>}
            {saveState === 'error' && <span className="text-red-400 text-sm">Error saving</span>}
            <button
              onClick={handleSave}
              disabled={saveState === 'saving'}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Your Info — read-only */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Your Info</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Name</span>
                <span className="text-sm text-zinc-100 font-medium">{user.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">EMT #</span>
                <span className="text-sm text-zinc-100 font-mono">{user.emt_number}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-500">Licensure Level</span>
                <span className="text-sm text-zinc-100">{user.licensure_level}</span>
              </div>
            </div>
          </div>

          {/* Shift Defaults */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Shift Defaults</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Default Shift</label>
                <select
                  value={postId}
                  onChange={e => setPostId(e.target.value ? Number(e.target.value) : '')}
                  className={selectClass}
                >
                  <option value="">N/A</option>
                  {shiftProfiles.map(p => (
                    <option key={p.id} value={p.id}>{p.name} — {p.station.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Default Partner</label>
                <select
                  value={partnerId}
                  onChange={e => setPartnerId(e.target.value ? Number(e.target.value) : '')}
                  className={selectClass}
                >
                  <option value="">N/A</option>
                  {partnerOptions.map(e => (
                    <option key={e.id} value={e.id}>{formatEmployeeDropdown(e)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Default Shift Length</label>
                <select
                  value={shiftLength}
                  onChange={e => setShiftLength(e.target.value ? Number(e.target.value) : '')}
                  className={selectClass}
                >
                  <option value="">N/A</option>
                  <option value={24}>24 hours</option>
                  <option value={48}>48 hours</option>
                </select>
              </div>
            </div>
          </div>

          {/* Personal */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Personal</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Birthday</label>
                <div className="flex gap-2">
                  <select
                    value={birthdayMonth}
                    onChange={e => setBirthdayMonth(e.target.value ? Number(e.target.value) : '')}
                    className={selectClass}
                  >
                    <option value="">Month</option>
                    {MONTHS.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <select
                    value={birthdayDay}
                    onChange={e => setBirthdayDay(e.target.value ? Number(e.target.value) : '')}
                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-28 shrink-0"
                  >
                    <option value="">Day</option>
                    {DAYS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Personal Cell</label>
                <input
                  type="tel"
                  value={personalCell}
                  onChange={e => setPersonalCell(e.target.value)}
                  placeholder="(555) 555-5555"
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Notifications */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Notifications</h2>
            <p className="text-xs text-zinc-600 mb-4">Notification delivery is not yet active.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Notification Preference</label>
                <select
                  value={notificationPref}
                  onChange={e => setNotificationPref(e.target.value)}
                  className={selectClass}
                >
                  <option value="none">None</option>
                  <option value="text">Text message</option>
                  <option value="email">Email</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Chore Reminder</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={reminderHours}
                    onChange={e => setReminderHours(e.target.value !== '' ? Number(e.target.value) : '')}
                    placeholder="—"
                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-24"
                  />
                  <span className="text-sm text-zinc-500">hours before shift end</span>
                </div>
              </div>
            </div>
          </div>
          {/* Performance */}
          {perfStats && (perfStats.d60.total > 0 || perfStats.d30.total > 0 || perfStats.last_shift !== null) && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-4">Performance</h2>
              <div className="grid grid-cols-3 gap-4 mb-3">
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Last 60 days</p>
                  <p className="text-xl font-semibold text-zinc-100">{formatRate(perfStats.d60.rate)}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{perfStats.d60.shifts} shift{perfStats.d60.shifts !== 1 ? 's' : ''}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Last 30 days</p>
                  <p className="text-xl font-semibold text-zinc-100">{formatRate(perfStats.d30.rate)}</p>
                  <p className="text-xs text-zinc-600 mt-0.5">{perfStats.d30.shifts} shift{perfStats.d30.shifts !== 1 ? 's' : ''}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Last shift</p>
                  <div className="flex items-baseline gap-1.5">
                    <p className="text-xl font-semibold text-zinc-100">{formatRate(perfStats.last_shift?.rate ?? null)}</p>
                    <span className={`text-sm font-medium ${
                      trendArrow(perfStats.d60.rate, perfStats.d30.rate) === '↑' ? 'text-green-400' :
                      trendArrow(perfStats.d60.rate, perfStats.d30.rate) === '↓' ? 'text-red-400' :
                      'text-zinc-600'
                    }`}>{trendArrow(perfStats.d60.rate, perfStats.d30.rate)}</span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {perfStats.last_shift ? `${perfStats.last_shift.done}/${perfStats.last_shift.total} chores` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
