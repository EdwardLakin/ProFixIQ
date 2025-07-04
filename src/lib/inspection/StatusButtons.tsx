'use client';

import { InspectionItem, InspectionItemStatus } from '@lib/inspection/types';

interface StatusButtonsProps {
  item: InspectionItem;
  sectionIndex: number;
  itemIndex: number;
  updateItem: (sectionIndex: number, itemIndex: number, updates: Partial<InspectionItem>) => void;
}

export default function StatusButtons({
  item,
  onStatusChange,
}: StatusButtonsProps) {
  const base = 'px-3 py-1 rounded font-bold text-white mr-2 mb-2 transition duration-200';

  const getStyle = (key: InspectionItemStatus) => {
    const status = item.status;
    const selected = status === key;
    switch (key) {
      case 'fail':
        return `${base} ${selected ? 'bg-red-600' : 'bg-red-400'}`;
      case 'recommend':
        return `${base} ${selected ? 'bg-yellow-600 text-black' : 'bg-yellow-400 text-black'}`;
      case 'ok':
        return `${base} ${selected ? 'bg-green-600' : 'bg-green-400'}`;
      case 'na':
        return `${base} ${selected ? 'bg-gray-600' : 'bg-gray-400'}`;
      default:
        return base;
    }
  };

  return (
    <div className="flex flex-wrap mt-2">
      <button className={getStyle('ok')} onClick={() => onStatusChange('ok')}>
        OK
      </button>
      <button className={getStyle('fail')} onClick={() => onStatusChange('fail')}>
        FAIL
      </button>
      <button className={getStyle('recommend')} onClick={() => onStatusChange('recommend')}>
        Recommend
      </button>
      <button className={getStyle('na')} onClick={() => onStatusChange('na')}>
        N/A
      </button>
    </div>
  );
}