"use client";

type SRCons = new () => SpeechRecognition;
type MaybeSR = SpeechRecognition | null;

function getSR(): SRCons | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as {
    SpeechRecognition?: SRCons;
    webkitSpeechRecognition?: SRCons;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? undefined;
}

export default function useVoiceGenerate(opts: {
  live?: (text: string) => void;
  onFinal?: (text: string) => void;
  autoStopMs?: number; // silence timeout
}) {
  const { live, onFinal, autoStopMs = 1200 } = opts;

  let sr: MaybeSR = null;
  let timer: number | undefined;
  let listening = false;

  const stop = () => {
    try {
      sr?.stop();
    } catch {
      /* noop */
    }
    listening = false;
    if (timer) window.clearTimeout(timer);
  };

  const start = () => {
    if (listening) return;
    const SR = getSR();
    if (!SR) return;

    sr = new SR();
    listening = true;

    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = "en-US";

    sr.onresult = (e: SpeechRecognitionEvent) => {
      const txt = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join("");

      live?.(txt);

      const isFinal = Array.from(e.results).some((r) => r.isFinal);
      if (isFinal) onFinal?.(txt);

      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => stop(), autoStopMs);
    };

    sr.onerror = () => stop();
    sr.onend = () => {
      listening = false;
    };

    try {
      sr.start();
    } catch {
      /* already started */
    }
  };

  return {
    get listening() {
      return listening;
    },
    start,
    stop,
  };
}