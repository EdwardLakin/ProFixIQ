'use client'

import React, { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/supabase'

export default function AccountPlanPanel() {
  const [email, setEmail] = useState<string | null>(null)
  const [plan, setPlan] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserPlan = async () => {
      const supabase = createBrowserClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      const {
        data: { user },
        error: userError
      } = await supabase.auth.getUser()

      if (user) {
        if (user.email) setEmail(user.email);

        const { data: planData, error: planError } = await supabase
          .from('user_plans')
          .select('plan')
          .eq('user_id', user.id)
          .single()

        if (planData?.plan) {
          setPlan(planData.plan)
        } else {
          console.error('Error fetching plan:', planError?.message)
        }
      } else if (userError) {
        console.error('Error fetching user:', userError.message)
      }
    }

    fetchUserPlan()
  }, [])

  return (
    <div className="bg-surface text-accent p-6 rounded-md shadow-card mb-8">
      <h2 className="text-lg font-semibold mb-2">Account & Plan</h2>
      <div className="text-muted text-sm mb-2">Logged in as: {email || 'Loading...'}</div>
      <div className="mt-2">
        <span className="font-medium">Current Plan: </span>
        <span className="font-semibold">{plan || 'Loading...'}</span>
      </div>
      <button
        className="mt-4 px-4 py-2 rounded bg-accent text-white hover:bg-accent/90 transition"
        onClick={() => window.location.href = '/account'}
      >
        Manage Account
      </button>
    </div>
  )
}