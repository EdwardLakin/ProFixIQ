'use client'

import React, { useState } from 'react'

export default function VinDecoderModal({
  onClose,
  onVehicleSelected,
}: {
  onClose: () => void
  onVehicleSelected: (vehicle: { year: string; make: string; model: string }) => void
}) {
  const [vin, setVin] = useState('')
  const [year, setYear] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(false)

  const handleDecodeVin = async () => {
    if (!vin || vin.length !== 17) {
      alert('VIN must be exactly 17 characters.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`)
      const data = await res.json()
      const results = data.Results

      const yearValue = results.find((r: any) => r.Variable === 'Model Year')?.Value || ''
      const makeValue = results.find((r: any) => r.Variable === 'Make')?.Value || ''
      const modelValue = results.find((r: any) => r.Variable === 'Model')?.Value || ''

      if (!yearValue || !makeValue || !modelValue) {
        alert('Failed to decode VIN. Please enter details manually.')
      } else {
        setYear(yearValue)
        setMake(makeValue)
        setModel(modelValue)
        onVehicleSelected({ year: yearValue, make: makeValue, model: modelValue })
      }
    } catch (error) {
      alert('Error decoding VIN.')
    } finally {
      setLoading(false)
    }
  }

  const handleManualSubmit = () => {
    if (!year || !make || !model) {
      alert('Please fill out all fields.')
      return
    }
    onVehicleSelected({ year, make, model })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-80 z-50 flex items-center justify-center">
      <div className="bg-white text-black w-full max-w-lg p-6 rounded-xl shadow-xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-black text-xl"
        >
          ×
        </button>

        <h2 className="text-2xl font-bold mb-4 text-center font-blackops">Select Vehicle</h2>

        <div className="space-y-4">
          <input
            type="text"
            placeholder="Enter VIN (17 characters)"
            value={vin}
            onChange={(e) => setVin(e.target.value.toUpperCase())}
            className="w-full px-4 py-2 rounded border border-gray-300"
            maxLength={17}
          />
          <button
            onClick={handleDecodeVin}
            disabled={loading}
            className="w-full bg-black text-white py-2 font-blackops rounded hover:bg-gray-800 transition"
          >
            {loading ? 'Decoding...' : 'Decode VIN'}
          </button>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold text-center mb-2">Or enter manually</h3>
            <input
              type="text"
              placeholder="Year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full px-4 py-2 rounded border border-gray-300 mb-2"
            />
            <input
              type="text"
              placeholder="Make"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              className="w-full px-4 py-2 rounded border border-gray-300 mb-2"
            />
            <input
              type="text"
              placeholder="Model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-4 py-2 rounded border border-gray-300 mb-4"
            />
            <button
              onClick={handleManualSubmit}
              className="w-full bg-black text-white py-2 font-blackops rounded hover:bg-gray-800 transition"
            >
              Set Vehicle
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}