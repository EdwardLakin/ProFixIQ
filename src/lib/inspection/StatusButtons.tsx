'use client';

import { InspectionItem, InspectionItemStatus } from '@lib/inspection/types';

interface StatusButtonsProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  onUpdateStatus: (sectionIndex: number, itemIndex: number, status: InspectionItemStatus) => void;
}

export default function StatusButtons({
  item,
  sectionIndex,
  itemIndex,
  onUpdateStatus,
}: StatusButtonsProps) {
  const base = 'px-3 py-1 rounded font-bold text-white mr-2 mb-2 transition duration-200';

  const getStyle = (key: InspectionItemStatus) => {
    const status = item.status;
    const isActive = status === key;
    switch (key) {
      case 'fail':
        return `${base} ${isActive ? 'bg-red-600' : 'bg-red-400'}`;
      case 'recommend':
        return `${base} ${isActive ? 'bg-yellow-600 text-black' : 'bg-yellow-400 text-black'}`;
      case 'ok':
        return `${base} ${isActive ? 'bg-green-600' : 'bg-green-400'}`;
      case 'na':
        return `${base} ${isActive ? 'bg-gray-600' : 'bg-gray-400'}`;
      default:
        return base;
    }
  };

  return (
    <div className="flex flex-wrap mt-2">
      <button className={getStyle('ok')} onClick={() => onUpdateStatus(sectionIndex, itemIndex, 'ok')}>
        OK
      </button>
      <button className={getStyle('fail')} onClick={() => onUpdateStatus(sectionIndex, itemIndex, 'fail')}>
        FAIL
      </button>
      <button className={getStyle('recommend')} onClick={() => onUpdateStatus(sectionIndex, itemIndex, 'recommend')}>
        Recommend
      </button>
      <button className={getStyle('na')} onClick={() => onUpdateStatus(sectionIndex, itemIndex, 'na')}>
        N/A
      </button>
    </div>
  );
}