// app/sign-in/page.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function SignInPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      router.push('/')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-center items-center px-4">
      <div className="bg-neutral-900 p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-4xl font-blackops text-orange-500 mb-4 text-center">ProFixIQ</h1>
        <p className="text-sm text-neutral-400 mb-6 text-center">Welcome back. Please sign in to continue.</p>

        <form onSubmit={handleSignIn} className="space-y-4">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 font-semibold rounded"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}