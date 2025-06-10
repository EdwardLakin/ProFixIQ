'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOtp({ email })
    if (!error) setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-900 text-white">
      <div className="max-w-md w-full space-y-6">
        <h1 className="text-2xl font-bold">Sign In</h1>
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 bg-gray-800 rounded border border-gray-600"
        />
        <button
          onClick={handleLogin}
          className="w-full bg-green-600 hover:bg-green-700 transition rounded p-3 font-medium"
        >
          {sent ? 'Check your email!' : 'Send Magic Link'}
        </button>
      </div>
    </div>
  )
}