"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";

type PlannerKind = "openai" | "simple";

export type VoiceAgentContext = {
  // high-level route hints
  route: string;
  query?: Record<string, string>;
  // page-specific hints (you set these from pages via <VoiceContextSetter/>)
  workOrderId?: string;
  vehicleId?: string;
  customerId?: string;
  shopId?: string;
  // user role hint (optional)
  role?: "owner" | "admin" | "manager" | "advisor" | "mechanic" | "parts";
  // anything else you want
  [k: string]: unknown;
};

type VoiceState = {
  isListening: boolean;
  transcript: string;
  lastRunId?: string | null;
  error?: string | null;
};

type VoiceAPI = {
  state: VoiceState;
  planner: PlannerKind;
  setPlanner: (p: PlannerKind) => void;

  // push contextual hints from a page
  setContext: (patch: Partial<VoiceAgentContext>) => void;
  clearContext: () => void;
  context: VoiceAgentContext;

  // voice controls
  startListening: () => void;
  stopListening: () => void;
  runTranscript: (overrideGoal?: string) => Promise<void>;
};

const VoiceCtx = createContext<VoiceAPI | null>(null);

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const sp = useSearchParams();
  const query = useMemo(() => {
    const q: Record<string, string> = {};
    sp?.forEach((v, k) => (q[k] = v));
    return q;
  }, [sp]);

  const [planner, setPlanner] = useState<PlannerKind>("openai");
  const [context, setContextState] = useState<VoiceAgentContext>({
    route: pathname,
    query,
  });
  const setContext = useCallback(
    (patch: Partial<VoiceAgentContext>) =>
      setContextState((c) => ({ ...c, ...patch })),
    [],
  );
  const clearContext = useCallback(
    () => setContextState({ route: pathname, query }),
    [pathname, query],
  );

  const [state, setState] = useState<VoiceState>({
    isListening: false,
    transcript: "",
    lastRunId: null,
    error: null,
  });

  const recRef = useRef<SpeechRecognition | null>(null);

  // Ensure native or webkit SpeechRecognition
  function ensureRecognizer(): SpeechRecognition | null {
    if (typeof window === "undefined") return null;
    const SR: any =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return null;
    if (recRef.current) return recRef.current;
    const rec: SpeechRecognition = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = true;

    rec.onresult = (e: SpeechRecognitionEvent) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setState((s) => ({ ...s, transcript: text }));
    };

    rec.onerror = (e: any) => {
      setState((s) => ({
        ...s,
        error: String(e?.error || "speech error"),
        isListening: false,
      }));
    };

    rec.onend = () => {
      setState((s) => ({ ...s, isListening: false }));
    };

    recRef.current = rec;
    return rec;
  }

  const startListening = useCallback(() => {
    const rec = ensureRecognizer();
    if (!rec) {
      setState((s) => ({
        ...s,
        error: "Speech recognition not supported in this browser.",
      }));
      return;
    }
    setState((s) => ({
      ...s,
      isListening: true,
      transcript: "",
      error: null,
    }));
    rec.start();
  }, []);

  const stopListening = useCallback(() => {
    recRef.current?.stop();
  }, []);

  // Very small intent helper: enriches the raw transcript with the current page context
  function buildGoal(raw: string, c: VoiceAgentContext): string {
    const lower = raw.trim().toLowerCase();

    if (
      c.workOrderId &&
      (lower.startsWith("add line") || lower.startsWith("add a line"))
    ) {
      const desc = raw.replace(/^add (a )?line\s*/i, "");
      return `On work order ${c.workOrderId}, add a line: "${desc}".`;
    }

    if (lower.startsWith("create work order for")) {
      return raw;
    }

    if (c.workOrderId && lower.startsWith("finish line")) {
      return `On work order ${c.workOrderId}, finish the current line.`;
    }

    if (c.workOrderId && lower.includes("on hold")) {
      return `On work order ${c.workOrderId}, put the current line on hold.`;
    }

    // fallback – let the LLM infer using the context we pass
    return raw;
  }

  const runTranscript = useCallback(
    async (overrideGoal?: string) => {
      const goal = buildGoal(overrideGoal ?? state.transcript, context);
      if (!goal.trim()) return;

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            goal,
            planner,
            context, // pass page+app context along
            idempotencyKey: crypto.randomUUID(),
          }),
        });

        const j = (await res.json().catch(() => ({}))) as {
          runId?: string;
          error?: string;
        };
        if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
        setState((s) => ({ ...s, lastRunId: j.runId ?? null }));
      } catch (e: any) {
        setState((s) => ({ ...s, error: e?.message || "Agent error" }));
      }
    },
    [state.transcript, context, planner],
  );

  const api: VoiceAPI = {
    state,
    planner,
    setPlanner,
    setContext,
    clearContext,
    context,
    startListening,
    stopListening,
    runTranscript,
  };

  // Keep route/query fresh in context automatically
  useEffect(() => {
    setContextState((c) => ({ ...c, route: pathname, query }));
  }, [pathname, query]);

  return <VoiceCtx.Provider value={api}>{children}</VoiceCtx.Provider>;
}

export function useVoice() {
  const v = useContext(VoiceCtx);
  if (!v) throw new Error("useVoice must be used within <VoiceProvider/>");
  return v;
}