import "server-only";

import { getOpenAIClient, isOpenAIConfigured } from "./openai";

// The one voice/model pairing every spoken-reply surface in the app should
// use. gpt-4o-mini-tts's "marin" voice is OpenAI's newest, most natural-
// sounding preset — this is what replaced the old, flat SpeechSynthesisUtterance
// fallback everywhere it was still the primary voice (see
// GenericInspectionScreen.tsx's speakLocal, now a last-resort fallback only).
// Keep every caller on this same pairing rather than letting each surface
// pick its own — a natural voice is only "the CoPilot's voice" if it sounds
// the same everywhere.
export const NATURAL_SPEECH_MODEL = "gpt-4o-mini-tts" as const;
export const NATURAL_SPEECH_VOICE = "marin" as const;
export const NATURAL_SPEECH_MAX_CHARACTERS = 4_000;

const DEFAULT_INSTRUCTIONS =
  "Speak clearly, naturally, and professionally for a working automotive technician. Do not add or omit information.";

export type NaturalSpeechFailure = {
  ok: false;
  status: number;
  code: "speech_not_configured" | "speech_generation_failed" | "speech_upstream_timeout";
  message: string;
};

export type NaturalSpeechResult = { ok: true; audio: ArrayBuffer } | NaturalSpeechFailure;

/**
 * The one place that actually calls OpenAI's TTS API. Every route that wants
 * a natural spoken reply — the Technician CoPilot's own speech endpoint and
 * inspection voice control's — calls this instead of duplicating the
 * request shape, so a future model/voice change (or added instructions)
 * only has to happen once.
 */
export async function synthesizeNaturalSpeech(input: {
  text: string;
  timeoutMs: number;
  instructions?: string;
}): Promise<NaturalSpeechResult> {
  if (!isOpenAIConfigured()) {
    return {
      ok: false,
      status: 503,
      code: "speech_not_configured",
      message: "Generated voice is not configured.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  try {
    const speech = await getOpenAIClient().audio.speech.create(
      {
        model: NATURAL_SPEECH_MODEL,
        voice: NATURAL_SPEECH_VOICE,
        input: input.text,
        instructions: input.instructions ?? DEFAULT_INSTRUCTIONS,
        response_format: "mp3",
      },
      { signal: controller.signal },
    );
    const audio = await speech.arrayBuffer();
    if (audio.byteLength === 0) {
      return {
        ok: false,
        status: 502,
        code: "speech_generation_failed",
        message: "OpenAI returned an empty speech response",
      };
    }
    return { ok: true, audio };
  } catch (caught) {
    const timedOut = controller.signal.aborted;
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      code: timedOut ? "speech_upstream_timeout" : "speech_generation_failed",
      message:
        caught instanceof Error ? caught.message : "Speech generation failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}
