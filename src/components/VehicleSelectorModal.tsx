'use client'

import React, { useState } from 'react'
import useVehicleInfo from '@/hooks/useVehicleInfo'

type Props = {
  onClose: () => void
}

export default function VehicleSelectorModal({ onClose }: Props) {
  const { updateVehicle } = useVehicleInfo()
  const [mode, setMode] = useState<'manual' | 'vin'>('manual')
  const [vin, setVin] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [error, setError] = useState('')

  const handleVINDecode = async () => {
    if (!vin.trim()) {
      setError('Please enter a VIN.')
      return
    }

    try {
      const res = await fetch(`/api/vin/decode?vin=${vin}`)
      const data = await res.json()
      if (data?.year && data?.make && data?.model) {
        updateVehicle({
          year: data.year,
          make: data.make,
          model: data.model,
          vin,
          plate2: '',
        })
        onClose()
      } else {
        setError('Invalid VIN or vehicle data not found.')
      }
    } catch (err) {
      setError('Error decoding VIN.')
    }
  }

  const handleManualSubmit = () => {
    if (!year || !make || !model) {
      setError('Please fill out all fields.')
      return
    }

    updateVehicle({ year, make, model, vin: '', plate2: '' })
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-xl"
        >
          ×
        </button>

        <h2 className="text-2xl font-bold text-center mb-4">Select Vehicle</h2>

        <div className="flex justify-center gap-4 mb-4">
          <button
            className={`px-4 py-2 rounded ${
              mode === 'manual' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
            onClick={() => setMode('manual')}
          >
            Manual
          </button>
          <button
            className={`px-4 py-2 rounded ${
              mode === 'vin' ? 'bg-blue-600 text-white' : 'bg-gray-200'
            }`}
            onClick={() => setMode('vin')}
          >
            VIN
          </button>
        </div>

        {mode === 'manual' ? (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
            <input
              type="text"
              placeholder="Make"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
            <input
              type="text"
              placeholder="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
            <button
              onClick={handleManualSubmit}
              className="bg-black text-white w-full py-2 rounded font-bold"
            >
              Save Vehicle
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Enter VIN"
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
            />
            <button
              onClick={handleVINDecode}
              className="bg-black text-white w-full py-2 rounded font-bold"
            >
              Decode VIN
            </button>
          </div>
        )}

        {error && <p className="text-red-600 mt-3 text-center">{error}</p>}
      </div>
    </div>
  )
}