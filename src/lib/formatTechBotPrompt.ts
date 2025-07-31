import type { VehicleInfo } from '@hooks/useVehicleInfo'

export function formatTechBotPrompt(vehicle: VehicleInfo, userInput: string): string {
  const { year, make, model, plate } = vehicle || {}

  let vehicleDetails = ''
  if (year || make || model || plate) {
    vehicleDetails = `Vehicle: ${year || 'Unknown'} ${make || 'Unknown'} ${model || 'Unknown'}${plate ? `, Engine: ${plate}` : ''}\n`
  }

  return `${vehicleDetails}User input: ${userInput}\nProvide a clear and accurate diagnostic response tailored to this vehicle. If additional data like sensor readings or DTCs are needed, ask for it. Your response should be structured and direct.`
}