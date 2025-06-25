import { Vehicle } from '@hooks/useVehicleInfo'

export function formatTechBotPrompt(vehicle: Vehicle, userInput: string): string {
  const { year, make, model, engine } = vehicle || {}

  let vehicleDetails = ''
  if (year || make || model || engine) {
    vehicleDetails = `Vehicle: ${year || 'Unknown'} ${make || 'Unknown'} ${model || 'Unknown'}${engine ? `, Engine: ${engine}` : ''}\n`
  }

  return `${vehicleDetails}User input: ${userInput}\nProvide a clear and accurate diagnostic response tailored to this vehicle. If additional data like sensor readings or DTCs are needed, ask for it. Your response should be structured and direct.`
}