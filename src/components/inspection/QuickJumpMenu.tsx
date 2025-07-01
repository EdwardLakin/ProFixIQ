// components/inspection/QuickJumpMenu.tsx

import { useEffect, useState } from 'react';

interface QuickJumpMenuProps {
  sections: string[];
  onJump: (index: number) => void;
}

export default function QuickJumpMenu({ sections, onJump }: QuickJumpMenuProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'j') setOpen((prev) => !prev); // Press 'j' to toggle
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setOpen(!open)}
        className="bg-orange-600 text-white px-3 py-2 rounded shadow"
      >
        Jump
      </button>
      {open && (
        <div className="mt-2 bg-gray-800 text-white rounded shadow p-2 space-y-1 max-h-64 overflow-y-auto">
          {sections.map((label, index) => (
            <button
              key={index}
              onClick={() => {
                onJump(index);
                setOpen(false);
              }}
              className="block w-full text-left px-2 py-1 hover:bg-gray-700"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}