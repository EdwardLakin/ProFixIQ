import {
  InspectionSection,
  InspectionSession,
  InspectionStatus,
} from '@lib/inspection/types'

export const defaultInspectionSession: InspectionSession = {
  vehicleId: '',
  customerId: '',
  templateName: '',
  templateId: '',
  workOrderId: '',
  sections: [],
  currentSectionIndex: 0,
  currentItemIndex: 0,
  started: false,
  completed: false,
  isPaused: false,
  isListening: false,
  transcript: '',
  location: '',
  lastUpdated: '',
  status: 'in_progress',
  quote: {
    laborTime: 0,
    laborRate: 0,
    price: 0,
    parts: [],
    totalCost: 0,
    type: 'economy',
    editable: true,
  },
}

export function initializeInspectionSession({
  vehicleId,
  customerId,
  templateName,
  templateId,
  location,
  sections,
}: {
  vehicleId: string
  customerId: string
  templateName: string
  templateId: string
  location: string
  sections: InspectionSection[]
}): InspectionSession {
  return {
    vehicleId,
    customerId,
    templateName,
    templateId,
    workOrderId: '',
    sections,
    currentSectionIndex: 0,
    currentItemIndex: 0,
    started: false,
    completed: false,
    isPaused: false,
    isListening: false,
    transcript: '',
    location,
    lastUpdated: Date.now().toString(),
    status: 'in_progress',
    quote: {
      laborTime: 0,
      laborRate: 0,
      price: 0,
      parts: [],
      totalCost: 0,
      type: 'economy',
      editable: true,
    },
  }
}