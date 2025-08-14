"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";

type Tab = {
  id: string;
  title: string;
  url: string;
  role: string;
  thumbnail?: string;
  pinned?: boolean;
};

type TabsContextType = {
  tabs: Tab[];
  activeTab: string;
  addTab: (tab: Tab) => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  setActiveTab: (id: string) => void;
  setTabs: (tabs: Tab[]) => void;
  role: string;
};

const TabsContext = createContext<TabsContextType | undefined>(undefined);

export const useTabs = () => {
  const context = useContext(TabsContext);
  if (!context) throw new Error("useTabs must be used within TabsProvider");
  return context;
};

export const TabsProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
    const supabase = createClientComponentClient<Database>();


  const [tabs, setTabsState] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [role, setRole] = useState("guest");

  // Load role + persisted tabs
  useEffect(() => {
    const loadTabs = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const roleKey = profile?.role || "guest";
      setRole(roleKey);

      const stored = localStorage.getItem(`tabs-${roleKey}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setTabsState(parsed.tabs || []);
        setActiveTab(parsed.activeTab || "");
      }
    };
    loadTabs();
  }, []);

  // Persist to localStorage on tab changes
  useEffect(() => {
    if (role) {
      localStorage.setItem(`tabs-${role}`, JSON.stringify({ tabs, activeTab }));
    }
  }, [tabs, activeTab, role]);

  const addTab = (tab: Tab) => {
    setTabsState((prev) => {
      if (prev.find((t) => t.id === tab.id)) return prev;
      return [...prev, tab];
    });
    setActiveTab(tab.id);
    router.push(tab.url);
  };

  const closeTab = (id: string) => {
    setTabsState((prev) => prev.filter((t) => t.id !== id));
    if (activeTab === id && tabs.length > 1) {
      const newActive = tabs.find((t) => t.id !== id);
      if (newActive) {
        setActiveTab(newActive.id);
        router.push(newActive.url);
      }
    }
  };

  const closeOthers = (id: string) => {
    setTabsState((prev) => prev.filter((t) => t.id === id || t.pinned));
    setActiveTab(id);
  };

  const setTabs = (newTabs: Tab[]) => {
    setTabsState(newTabs);
  };

  return (
    <TabsContext.Provider
      value={{
        tabs,
        activeTab,
        addTab,
        closeTab,
        closeOthers,
        setActiveTab,
        setTabs,
        role,
      }}
    >
      {children}
    </TabsContext.Provider>
  );
};
