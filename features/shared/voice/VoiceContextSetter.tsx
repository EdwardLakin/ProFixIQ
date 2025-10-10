"use client";

import { useEffect } from "react";
import { useVoice, VoiceAgentContext } from "./VoiceProvider";

export default function VoiceContextSetter(props: Partial<VoiceAgentContext>) {
  const { setContext } = useVoice();
  useEffect(() => {
    setContext(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}