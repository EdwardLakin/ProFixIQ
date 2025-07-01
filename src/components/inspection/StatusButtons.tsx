// src/components/inspection/StatusButtons.tsx

import { CheckCircleIcon, XCircleIcon, ExclamationTriangleIcon, MinusCircleIcon } from '@heroicons/react/24/outline';

interface StatusButtonsProps {
  sectionIndex: number;
  itemIndex: number;
  value?: string;
  onChange: (status: 'ok' | 'fail' | 'na' | 'recommend') => void;
}

export default function StatusButtons({
  sectionIndex,
  itemIndex,
  value,
  onChange,
}: StatusButtonsProps) {
  const statusOptions: {
    key: 'ok' | 'fail' | 'na' | 'recommend';
    label: string;
    Icon: React.ComponentType<any>;
    color: string;
  }[] = [
    { key: 'ok', label: 'OK', Icon: CheckCircleIcon, color: 'text-green-400' },
    { key: 'fail', label: 'Fail', Icon: XCircleIcon, color: 'text-red-500' },
    { key: 'recommend', label: 'Recommend', Icon: ExclamationTriangleIcon, color: 'text-yellow-400' },
    { key: 'na', label: 'N/A', Icon: MinusCircleIcon, color: 'text-gray-400' },
  ];

  return (
    <div className="flex justify-start gap-2 flex-wrap mt-2">
      {statusOptions.map(({ key, label, Icon, color }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`flex items-center gap-1 border px-2 py-1 rounded text-sm ${
            value === key ? `bg-white/10 border-white ${color}` : 'border-gray-700 text-white hover:bg-white/5'
          }`}
        >
          <Icon className={`w-4 h-4 ${color}`} />
          {label}
        </button>
      ))}
    </div>
  );
}