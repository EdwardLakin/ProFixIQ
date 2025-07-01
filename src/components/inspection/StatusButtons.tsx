// src/components/inspection/StatusButtons.tsx
import React from 'react';
import { InspectionItemStatus } from '@lib/inspection/types';

interface StatusButtonsProps {
  currentStatus?: InspectionItemStatus;
  onStatusChange: (status: InspectionItemStatus) => void;
}

const StatusButtons: React.FC<StatusButtonsProps> = ({ currentStatus, onStatusChange }) => {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onStatusChange('ok')}
        className={`px-3 py-1 rounded text-white ${currentStatus === 'ok' ? 'bg-green-600' : 'bg-green-800'}`}
      >
        ✅ OK
      </button>
      <button
        onClick={() => onStatusChange('fail')}
        className={`px-3 py-1 rounded text-white ${currentStatus === 'fail' ? 'bg-red-600' : 'bg-red-800'}`}
      >
        ❌ Fail
      </button>
      <button
        onClick={() => onStatusChange('recommend')}
        className={`px-3 py-1 rounded text-white ${currentStatus === 'recommend' ? 'bg-yellow-600' : 'bg-yellow-800'}`}
      >
        ⚠️ Recommend
      </button>
      <button
        onClick={() => onStatusChange('na')}
        className={`px-3 py-1 rounded text-white ${currentStatus === 'na' ? 'bg-gray-600' : 'bg-gray-800'}`}
      >
        ⛔ N/A
      </button>
    </div>
  );
};

export default StatusButtons;