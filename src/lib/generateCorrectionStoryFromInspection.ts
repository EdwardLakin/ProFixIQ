// src/lib/generateCorrectionStoryFromInspection.ts

type InspectionItem = {
  category: string
  item: string
  status: string
  measurements?: string
  notes?: string
}

export function generateCorrectionStory(items: InspectionItem[]): string {
  const corrections: string[] = []

  for (const item of items) {
    const label = `${item.category}: ${item.item}`
    const clean = (s: string | undefined) => s?.trim().toLowerCase() || ''

    const failed = item.status === 'fail'
    const measured = clean(item.measurements) !== 'empty'

    if (failed) {
      if (measured) {
        corrections.push(`Replaced ${item.item} (${item.measurements})`)
      } else if (item.notes?.toLowerCase().includes('replace')) {
        corrections.push(item.notes)
      } else {
        corrections.push(`Repaired or replaced ${item.item}`)
      }
    }

    if (clean(item.item).includes('oil') && item.notes?.includes('change')) {
      corrections.push('Completed oil change')
    }

    if (clean(item.item).includes('coolant') && measured) {
      corrections.push(`Topped coolant to ${item.measurements}`)
    }

    if (clean(item.item).includes('battery') && measured) {
      corrections.push(`Installed new battery (${item.measurements} CCA)`)
    }

    if (clean(item.item).includes('tire pressure') && measured) {
      corrections.push(`Set tire pressure to ${item.measurements}`)
    }

    if (clean(item.item).includes('tread depth') && measured) {
      corrections.push(`Documented tread depth: ${item.measurements}`)
    }
  }

  return corrections.length > 0
    ? corrections.join(', ') + '.'
    : 'All items passed or no actions required.'
}