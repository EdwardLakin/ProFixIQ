// components/tabs/DashboardTabs.tsx
'use client';

import { useTabs } from '@context/TabsProvider';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@components/ui/Button';
import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import html2canvas from 'html2canvas';

export default function DashboardTabs() {
  const { tabs, activeTab, closeTab, closeOthers, setActiveTab } = useTabs();
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const iframeRefs = useRef<Record<string, HTMLIFrameElement | null>>({});

  useEffect(() => {
    tabs.forEach((tab) => {
      if (!previews[tab.id]) {
        const capture = async () => {
          const iframe = iframeRefs.current[tab.id];
          if (!iframe) return;
          try {
            const canvas = await html2canvas(
              iframe.contentDocument?.body || document.body
            );
            const dataUrl = canvas.toDataURL();
            setPreviews((prev) => ({ ...prev, [tab.id]: dataUrl }));
          } catch {
            // Ignore capture errors
          }
        };
        setTimeout(capture, 1000);
      }
    });
  }, [tabs, previews]);

  return (
    <div className="w-full border-b border-neutral-800 bg-neutral-900 flex flex-col">
      <div className="flex overflow-x-auto p-2 gap-2">
        {tabs.map((tab) => (
          <motion.div
            key={tab.id}
            className={`flex items-center rounded px-3 py-1 ${
              tab.id === activeTab ? 'bg-orange-700 text-white' : 'bg-neutral-700 text-gray-200'
            }`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <button
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2"
              title={tab.title}
            >
              {tab.thumbnail && (
                <Image
                  src={tab.thumbnail}
                  alt="preview"
                  width={32}
                  height={20}
                  className="rounded border border-neutral-600"
                />
              )}
              <span className="truncate max-w-[120px]">{tab.title}</span>
            </button>
            <button onClick={() => closeTab(tab.id)} className="ml-2 text-sm text-red-300">
              ✕
            </button>
          </motion.div>
        ))}
        {activeTab && (
          <Button size="sm" variant="ghost" onClick={() => closeOthers(activeTab)}>
            Close Others
          </Button>
        )}
      </div>

      <div className="relative w-full h-[calc(100vh-120px)]">
        {tabs.map((tab) => (
          <AnimatePresence key={tab.id}>
            {tab.id === activeTab && (
              <motion.iframe
                key={tab.id}
                ref={(el: HTMLIFrameElement | null) => {
                  iframeRefs.current[tab.id] = el;
                }}
                src={tab.url}
                className="absolute inset-0 w-full h-full"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            )}
          </AnimatePresence>
        ))}
      </div>
    </div>
  );
}