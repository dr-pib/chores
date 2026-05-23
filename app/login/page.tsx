'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [emtNumber, setEmtNumber] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_username: username, emt_number: emtNumber }),
      })
      if (res.ok) {
        router.push('/setup')
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Login failed')
      }
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">EMS Station Chores</h1>
          <p className="text-zinc-400 text-sm mt-1">Sign in to continue</p>
        </div>

        <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email-username" className="block text-sm font-medium text-zinc-300 mb-1.5">
                Email username
              </label>
              <input
                id="email-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jjones"
                required
                autoComplete="username"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <p className="text-zinc-500 text-xs mt-1">Part before the @ in your email</p>
            </div>

            <div>
              <label htmlFor="emt-number" className="block text-sm font-medium text-zinc-300 mb-1.5">
                EMT number
              </label>
              <input
                id="emt-number"
                type="text"
                value={emtNumber}
                onChange={(e) => setEmtNumber(e.target.value)}
                placeholder="1234"
                required
                autoComplete="current-password"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors text-sm"
            >
              {isPending ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <div className="mt-6 bg-zinc-900 rounded-xl border border-zinc-800 p-4">
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-2">Demo accounts</p>
          <div className="space-y-1 text-xs text-zinc-400 font-mono">
            <div>admin / 0001 <span className="text-zinc-600">(Dom)</span></div>
            <div>arivera / 1001 <span className="text-zinc-600">(Supervisor)</span></div>
            <div>jjones / 2001 <span className="text-zinc-600">(24-7)</span></div>
            <div>cdavis / 3001 <span className="text-zinc-600">(24-8)</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
