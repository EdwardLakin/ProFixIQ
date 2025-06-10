'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { User } from '@/lib/types'

export default function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getSession = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (data?.user) {
        setUser({
          id: data.user.id,
          email: data.user.email ?? '',
          plan: 'free', // You can update this later by fetching from your DB
        })
      }
      setLoading(false)
    }

    getSession()
  }, [])

  return { user, loading }
}