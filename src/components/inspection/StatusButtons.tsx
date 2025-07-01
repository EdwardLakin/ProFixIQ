'use client'

import { InspectionItemStatus } from '@lib/inspection/types'

interface StatusButtonsProps {
  status?: InspectionItemStatus
  onSelect: (status: InspectionItemStatus) => void
}

export default function StatusButtons({ status, onSelect }: StatusButtonsProps) {
  const base = 'px-3 py-1 rounded font-bold text-white mr-2 mb-2'
  const getStyle = (key: InspectionItemStatus) =>
    `${base} ${
      status === key
        ? key === 'ok'
          ? 'bg-green-600'
          : key === 'fail'
          ? 'bg-red-600'
          : key === 'recommend'
          ? 'bg-yellow-600 text-black'
          : 'bg-gray-600'
        : 'bg-gray-400'
    }`

  return (
    <div className="flex flex-wrap mt-2">
      <button className={getStyle('ok')} onClick={() => onSelect('ok')}>
        OK
      </button>
      <button className={getStyle('fail')} onClick={() => onSelect('fail')}>
        FAIL
      </button>
      <button className={getStyle('recommend')} onClick={() => onSelect('recommend')}>
        Recommend
      </button>
      <button className={getStyle('na')} onClick={() => onSelect('na')}>
        N/A
      </button>
    </div>
  )
}