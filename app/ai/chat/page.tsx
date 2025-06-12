'use client'

import { useState } from 'react'
import { askTechBot } from '@/lib/techBot'

type Message = {
  role: 'user' | 'ai'
  text: string
}

export default function TechBot() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'general' | 'dtc'>('general')
  const [dtcCode, setDtcCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    if (!input && mode === 'general') return
    if (mode === 'dtc' && !dtcCode) return

    setLoading(true)

    const userPrompt =
      mode === 'general' ? input : `DTC Code: ${dtcCode}\n${input}`

    const userMessage: Message = { role: 'user', text: userPrompt }
    setMessages((prev) => [...prev, userMessage])

    const aiResponse = await askTechBot(userPrompt)
    const aiMessage: Message = { role: 'ai', text: aiResponse }

    setMessages((prev) => [...prev, aiMessage])
    setInput('')
    setDtcCode('')
    setLoading(false)
  }

  return (
    <div className="p-4 space-y-4 max-w-xl mx-auto">
      <h2 className="text-lg font-bold">TechBot</h2>

      <div className="flex gap-4">
        <label>
          <input
            type="radio"
            value="general"
            checked={mode === 'general'}
            onChange={() => setMode('general')}
          />
          <span className="ml-2">General Repair</span>
        </label>
        <label>
          <input
            type="radio"
            value="dtc"
            checked={mode === 'dtc'}
            onChange={() => setMode('dtc')}
          />
          <span className="ml-2">DTC Diagnosis</span>
        </label>
      </div>

      {mode === 'dtc' && (
        <input
          className="w-full border p-2 rounded"
          placeholder="Enter DTC code (e.g., P0455)"
          value={dtcCode}
          onChange={(e) => setDtcCode(e.target.value)}
        />
      )}

      <textarea
        className="w-full border p-2 rounded"
        rows={3}
        placeholder={
          mode === 'general'
            ? 'Describe the problem...'
            : 'Optional: Add extra details or symptoms...'
        }
        value={input}
        onChange={(e) => setInput(e.target.value)}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {loading ? 'Thinking…' : 'Ask AI'}
      </button>

      <div className="space-y-2 mt-6">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded ${
              msg.role === 'user' ? 'bg-gray-200' : 'bg-green-100'
            }`}
          >
            <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong> {msg.text}
          </div>
        ))}
      </div>
    </div>
  )
}