'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [username, setUsername] = useState('')
  const [emtNumber, setEmtNumber] = useState('')
  const crewRows = [
    [
      { name: 'Scottie', emtNumber: '17857' },
      { name: 'Brent', emtNumber: '33493' },
    ],
    [
      { name: 'Michael Crowley', emtNumber: '28454' },
      { name: 'Dale', emtNumber: '26430' },
    ],
    [
      { name: 'Tim', emtNumber: '28645' },
      { name: 'Stormy', emtNumber: '34762' },
    ],
    [
      { name: 'Teddy', emtNumber: '27898' },
      { name: 'Cathy', emtNumber: '27889' },
    ],
    [
      { name: 'Paige', emtNumber: '34387' },
      { name: 'Jasmin', emtNumber: '36232' },
    ],
    [
      { name: 'Clay', emtNumber: '33784' },
      { name: 'Shaun', emtNumber: '30934' },
    ],
    [
      { name: 'Zac', emtNumber: '24243' },
      { name: 'Mary', emtNumber: '15559' },
    ],
  ]
  const otherAccounts = [
    { name: 'Nathan', emtNumber: '22592' },
    { name: 'Melissa', emtNumber: '34195' },
    { name: 'JoRob', emtNumber: '14557' },
    { name: 'Richie', emtNumber: '16245' },
    { name: 'Gina', emtNumber: '20328' },
    { name: 'Candace', emtNumber: '26887' },
    { name: 'Duncan', emtNumber: '22407' },
    { name: 'Katie', emtNumber: '32740' },
    { name: 'Binford', emtNumber: '30141' },
  ]

  function loginWithCredentials(usernameToUse: string, emtNumberToUse: string) {
    setError('')
    setUsername(usernameToUse)
    setEmtNumber(emtNumberToUse)
    startTransition(async () => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_username: usernameToUse, emt_number: emtNumberToUse }),
      })
      if (res.ok) {
        router.push('/my-chores?from=login')
      } else {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Login failed')
      }
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    loginWithCredentials(username, emtNumber)
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
                Email username <span className="text-zinc-500 font-normal">(optional)</span>
              </label>
              <input
                id="email-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="jjones"
                autoComplete="username"
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <p className="text-zinc-500 text-xs mt-1">Use this only if two people ever share a test credential.</p>
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
          <p className="text-zinc-500 text-xs font-medium uppercase tracking-wider mb-3">Testing accounts</p>
          <div className="space-y-2">
            {crewRows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-2 gap-2">
                {row.map(account => (
                  <button
                    key={account.emtNumber}
                    type="button"
                    disabled={isPending}
                    onClick={() => loginWithCredentials('', account.emtNumber)}
                    className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition-colors hover:border-blue-500/60 hover:bg-blue-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="font-medium text-zinc-300">{account.name}</span>
                    <span className="font-mono text-zinc-500">{account.emtNumber}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-4 border-t border-zinc-800 pt-3">
            <p className="text-zinc-600 text-xs font-medium uppercase tracking-wider mb-2">Other testers</p>
            <div className="grid grid-cols-2 gap-2">
              {otherAccounts.map(account => (
                <button
                  key={account.emtNumber}
                  type="button"
                  disabled={isPending}
                  onClick={() => loginWithCredentials('', account.emtNumber)}
                  className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-left text-xs transition-colors hover:border-blue-500/60 hover:bg-blue-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="font-medium text-zinc-300">{account.name}</span>
                  <span className="font-mono text-zinc-500">{account.emtNumber}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
