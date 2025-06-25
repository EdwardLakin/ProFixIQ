'use client'

import { useEffect, useState } from 'react'
import { useUser } from '@supabase/auth-helpers-react'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@types/supabase'
import JobQueueCard from '@components/JobQueueCard'
import { Button } from '@components/ui/Button'
import { format } from 'date-fns'

const supabase = createBrowserClient<Database>()

export default function TechPunchInPage() {
  const user = useUser()
  const [jobs, setJobs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [punchingIn, setPunchingIn] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchJobs()
    }
  }, [user])

  async function fetchJobs() {
    setLoading(true)
    const { data, error } = await supabase
      .from('work_order_lines')
      .select('*, vehicles(*), inspections(*), assigned_tech:assigned_tech_id(*)')
      .eq('assigned_tech_id', user?.id)
      .in('status', ['awaiting', 'on_hold'])
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching jobs:', error)
    } else {
      setJobs(data || [])
    }

    setLoading(false)
  }

  async function punchIn(lineId: string) {
    setPunchingIn(lineId)
    const { error } = await supabase
      .from('work_order_lines')
      .update({
        status: 'in_progress',
        punched_in_at: new Date().toISOString(),
      })
      .eq('id', lineId)

    if (error) {
      console.error('Error punching in:', error)
    } else {
      await fetchJobs()
    }

    setPunchingIn(null)
  }

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-accent">Technician Punch-In</h1>

      {loading && <p>Loading jobs...</p>}

      {!loading && jobs.length === 0 && (
        <p className="text-muted">No jobs currently available for punch-in.</p>
      )}

      {!loading &&
        jobs.map((job) => (
          <div key={job.id} className="mb-4 border rounded-lg shadow-card bg-surface p-4">
            <JobQueueCard job={job} />
            <Button
              className="mt-2"
              onClick={() => punchIn(job.id)}
              disabled={punchingIn === job.id}
            >
              {punchingIn === job.id ? 'Punching In...' : 'Start This Job'}
            </Button>
          </div>
        ))}
    </div>
  )
}