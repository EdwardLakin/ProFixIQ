'use client'

import { useState } from 'react'
import useVehicleInfo from '@/hooks/useVehicleInfo'
import { analyzeDTC } from '@/lib/diagnoseHandler'
import Markdown from 'react-markdown'
import { VehicleSelectorModal } from '@/components/VehicleSelectorModal'

export default function DTCDecoder() {
  const { vehicle, setVehicle, clearVehicle } = useVehicleInfo()
  const [dtc, setDtc] = useState('')
  const [answer, setAnswer] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)

  const handleSubmit = async () => {
    if (!vehicle) {
      alert('Please select a vehicle first.')
      return
    }

    setLoading(true)
    const response = await analyzeDTC(dtc, messages, vehicle)
    const updatedMessages = [...messages, { role: 'user', content: dtc }, { role: 'assistant', content: response }]
    setMessages(updatedMessages)
    setAnswer(response)
    setLoading(false)
  }

  const handleFollowUp = async () => {
    if (!followUp.trim()) return
    setLoading(true)
    const response = await analyzeDTC(followUp, messages, vehicle)
    const updatedMessages = [...messages, { role: 'user', content: followUp }, { role: 'assistant', content: response }]
    setMessages(updatedMessages)
    setAnswer(response)
    setFollowUp('')
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white px-4 py-12">
      <div className="max-w-4xl mx-auto bg-white bg-opacity-5 backdrop-blur-md p-8 rounded-lg shadow-lg">
        <h1 className="text-5xl font-blackOps text-center mb-8">DTC Decoder</h1>

        {!vehicle ? (
          <div className="text-center space-y-4">
            <p className="text-xl">Please select your vehicle</p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Enter Vehicle Info
            </button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center gap-4 mb-6">
              <h2 className="text-3xl font-blackOps">Vehicle Info</h2>
              <p className="text-xl">{vehicle.year} {vehicle.make} {vehicle.model}</p>
              <button onClick={clearVehicle} className="text-sm text-red-400 underline">Change Vehicle</button>
            </div>

            <div className="flex flex-col gap-6 items-center">
              <input
                type="text"
                value={dtc}
                onChange={(e) => setDtc(e.target.value.toUpperCase())}
                placeholder="Enter DTC"
                className="w-72 text-center py-3 px-4 rounded-lg border border-gray-600 bg-white bg-opacity-10 text-xl font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              />
              <button
                onClick={handleSubmit}
                className="w-40 h-14 text-lg font-blackOps bg-blue-700 hover:bg-blue-800 text-white rounded-lg shadow-md"
              >
                Analyze DTC
              </button>
            </div>
          </>
        )}

        {answer && (
          <div className="mt-10 bg-black bg-opacity-30 rounded-lg p-6 border border-white/10">
            <Markdown className="prose prose-invert">{answer}</Markdown>

            <div className="mt-6 flex flex-col gap-4">
              <input
                type="text"
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                placeholder="Ask a follow-up question..."
                className="w-full px-4 py-2 rounded bg-white/10 border border-gray-500 text-white placeholder-gray-300"
              />
              <button
                onClick={handleFollowUp}
                disabled={loading}
                className="self-start px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded font-semibold disabled:opacity-50"
              >
                Ask
              </button>
            </div>
          </div>
        )}
      </div>

      <VehicleSelectorModal isOpen={showModal} onClose={() => setShowModal(false)} onSelect={(v) => setVehicle(v)} />
    </div>
  )
}