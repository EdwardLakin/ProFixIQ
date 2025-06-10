'use client'

import React from 'react'

type WorkOrderLine = {
  complaint: string
  cause?: string
  correction?: string
  tools?: string[]
  labor_time?: string
}

type Props = {
  lines: WorkOrderLine[]
  onChange: (lines: WorkOrderLine[]) => void
}

export default function WorkOrderLineEditor({ lines, onChange }: Props) {
  const updateLine = (index: number, field: keyof WorkOrderLine, value: string | string[]) => {
    const updated = [...lines]
    if (field === 'tools' && typeof value === 'string') {
      updated[index][field] = value.split(',').map(t => t.trim())
    } else {
      updated[index][field] = value as any
    }
    onChange(updated)
  }

  return (
    <div className="space-y-6">
      {lines.map((line, index) => (
        <div key={index} className="p-4 bg-muted/10 border border-muted rounded space-y-3">
          <div>
            <label className="font-semibold block">Complaint</label>
            <input
              type="text"
              value={line.complaint}
              onChange={(e) => updateLine(index, 'complaint', e.target.value)}
              className="w-full p-2 bg-background border border-muted rounded"
                        />
        </div>

        <div>
          <label className="font-semibold block">Cause</label>
          <input
            type="text"
            value={line.cause || ''}
            onChange={(e) => updateLine(index, 'cause', e.target.value)}
            className="w-full p-2 bg-background border border-muted rounded"
          />
        </div>

        <div>
          <label className="font-semibold block">Correction</label>
          <input
            type="text"
            value={line.correction || ''}
            onChange={(e) => updateLine(index, 'correction', e.target.value)}
            className="w-full p-2 bg-background border border-muted rounded"
          />
        </div>

        <div>
          <label className="font-semibold block">Tools (comma-separated)</label>
          <input
            type="text"
            value={(line.tools || []).join(', ')}
            onChange={(e) => updateLine(index, 'tools', e.target.value)}
            className="w-full p-2 bg-background border border-muted rounded"
          />
        </div>

        <div>
          <label className="font-semibold block">Labor Time (hours)</label>
          <input
            type="number"
            step="0.1"
            value={line.labor_time || ''}
            onChange={(e) => updateLine(index, 'labor_time', e.target.value)}
            className="w-full p-2 bg-background border border-muted rounded"
          />
        </div>
      </div>
      ))}
    </div>
  )
}