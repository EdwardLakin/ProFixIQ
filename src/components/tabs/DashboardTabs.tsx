// src/components/tabs/DashboardTabs.tsx
'use client';

import { useTabs } from '@context/TabsProvider';
import { X } from 'lucide-react';

export default function DashboardTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs();

  return (
    <div className="bg-neutral-900 border-b border-neutral-800">
      <div className="flex overflow-x-auto space-x-1 p-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`flex items-center space-x-2 px-3 py-1 rounded cursor-pointer ${
              activeTabId === tab.id ? 'bg-orange-600 text-white' : 'bg-neutral-800 text-gray-300'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.title}</span>
            <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="p-4">
        {tabs.find((tab) => tab.id === activeTabId)?.content || (
          <p className="text-gray-500">Select a tab to view content</p>
        )}
      </div>
    </div>
  );
}