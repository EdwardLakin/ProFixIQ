'use client';

import { InspectionItem, InspectionItemStatus } from '@lib/inspection/types';

interface StatusButtonsProps {
  item: InspectionItem;
  index: number;
  onUpdateStatus: (status: InspectionItemStatus) => void;
}

export default function StatusButtons({
  item,
  index,
  onUpdateStatus,
}: StatusButtonsProps) {
  const base =
    'px-3 py-1 rounded font-bold text-white mr-2 mb-2 transition duration-200';

  const getStyle = (key: InspectionItemStatus) => {
    const status = item.status;
    return `${base} ${
      status === key
        ? key === 'fail'
          ? 'bg-red-600'
          : key === 'ok'
          ? 'bg-green-600'
          : key === 'recommend'
          ? 'bg-yellow-600 text-black'
          : 'bg-gray-600'
        : 'bg-gray-400'
    }`;
  };

  return (
    <div className="flex flex-wrap mt-2">
      <button className={getStyle('ok')} onClick={() => onUpdateStatus('ok')}>
        OK
      </button>
      <button className={getStyle('fail')} onClick={() => onUpdateStatus('fail')}>
        FAIL
      </button>
      <button
        className={getStyle('recommend')}
        onClick={() => onUpdateStatus('recommend')}
      >
        Recommend
      </button>
      <button className={getStyle('na')} onClick={() => onUpdateStatus('na')}>
        N/A
      </button>
    </div>
  );
}