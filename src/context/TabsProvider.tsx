// src/context/TabsProvider.tsx
'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

type Tab = {
  id: string;
  title: string;
  content: ReactNode;
};

type TabsContextType = {
  tabs: Tab[];
  activeTabId: string | null;
  openTab: (id: string, title: string, content: ReactNode) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
};

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const TabsProvider = ({ children }: { children: ReactNode }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openTab = (id: string, title: string, content: ReactNode) => {
    setTabs((prev) => {
      const exists = prev.find((tab) => tab.id === id);
      if (!exists) {
        return [...prev, { id, title, content }];
      }
      return prev;
    });
    setActiveTabId(id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => prev.filter((tab) => tab.id !== id));
    if (activeTabId === id && tabs.length > 1) {
      const newTabs = tabs.filter((tab) => tab.id !== id);
      setActiveTabId(newTabs[newTabs.length - 1]?.id ?? null);
    }
  };

  const value: TabsContextType = {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTab: setActiveTabId,
  };

  return <TabsContext.Provider value={value}>{children}</TabsContext.Provider>;
};

export const useTabs = () => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('useTabs must be used within TabsProvider');
  return context;
};