'use client'

import { useState } from 'react'
import { useVehicleInfo } from '@hooks/useVehicleInfo'
import Button from '@components/ui/Button'
import { Input } from '@components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@components/ui/Card'
import { Textarea } from '@components/ui/textarea'

export default function TechBot() {
  const { localVehicle } = useVehicleInfo()
  const [input, setInput] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleAskTechBot = async () => {
    setLoading(true)
    setResponse('')
    setError('')

    try {
      if (!localVehicle || !localVehicle.make || !localVehicle.model || !localVehicle.year) {
        setError('Please select a vehicle first.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: localVehicle,
          input,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong.')
      }

      setResponse(data.result)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="max-w-2xl mx-auto mt-6 bg-surface shadow-card border border-border">
      <CardHeader>
        <CardTitle className="text-accent">TechBot Diagnostic Assistant</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          TechBot is your AI-powered repair assistant. Ask about fault codes, symptoms, or
          diagnostic procedures. It factors in your selected vehicle and responds like a seasoned
          technician.
        </p>

        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the issue or enter a DTC code..."
          className="bg-background"
        />
        <Button onClick={handleAskTechBot} disabled={loading || !input}>
          {loading ? 'Analyzing...' : 'Ask TechBot'}
        </Button>

        {error && <p className="text-destructive text-sm">{error}</p>}
        {response && (
          <Textarea
            value={response}
            readOnly
            className="bg-muted border-muted text-sm h-64"
          />
        )}
      </CardContent>
    </Card>
  )
}