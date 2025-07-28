import { QuoteLine } from './generateQuoteFromInspection';
import { InspectionItem } from '@lib/inspection/types';

/**
 * Match common inspection items to menu quote templates
 */
export function matchToMenuItem(
  name: string,
  item: InspectionItem
): QuoteLine | null {
  const normalized = name.toLowerCase();

  const defaultRate = 120;

  if (normalized.includes('brake') || normalized.includes('pad')) {
    return {
      description: 'Brake Pad Replacement',
      hours: 1.2,
      rate: defaultRate,
      total: parseFloat((1.2 * defaultRate).toFixed(2)),
      job_type: 'repair',
    };
  }

  if (normalized.includes('battery')) {
    return {
      description: 'Battery Replacement',
      hours: 0.5,
      rate: defaultRate,
      total: parseFloat((0.5 * defaultRate).toFixed(2)),
      job_type: 'repair',
    };
  }

  if (normalized.includes('oil') && normalized.includes('change')) {
    return {
      description: 'Oil Change Service',
      hours: 0.7,
      rate: defaultRate,
      total: parseFloat((0.7 * defaultRate).toFixed(2)),
      job_type: 'maintenance',
    };
  }

  if (normalized.includes('filter') || normalized.includes('air')) {
    return {
      description: 'Filter Replacement',
      hours: 0.4,
      rate: defaultRate,
      total: parseFloat((0.4 * defaultRate).toFixed(2)),
      job_type: 'maintenance',
    };
  }

  return null; // Fallback to AI generation
}