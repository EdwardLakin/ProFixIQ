"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";

import PauseResumeButton from "@shared/lib/inspection/PauseResume";
import PhotoUploadButton from "@shared/lib/inspection/PhotoUploadButton";
import StartListeningButton from "@shared/lib/inspection/StartListeningButton";
import ProgressTracker from "@shared/lib/inspection/ProgressTracker";
import useInspectionSession from "@shared/hooks/useInspectionSession";

import { handleTranscriptFn } from "@shared/lib/inspection/handleTranscript";
import { interpretCommand } from "@shared/components/inspection/interpretCommand";

import {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
} from "@shared/lib/inspection/types";

import { SaveInspectionButton } from "@shared/components/inspection/SaveInspectionButton";
import FinishInspectionButton from "@shared/components/inspection/FinishInspectionButton";

import { v4 as uuidv4 } from "uuid";

declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

export default function CustomInspectionPage() {
  const searchParams = useSearchParams();
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [isListening, setIsListening] = useState(false);
  const [, setTranscript] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const templateName = searchParams.get("template") || "Custom Inspection";

  const customer = {
    first_name: searchParams.get("first_name") || "",
    last_name: searchParams.get("last_name") || "",
    phone: searchParams.get("phone") || "",
    email: searchParams.get("email") || "",
    address: "",
    city: "",
    province: "",
    postal_code: "",
  };

  const vehicle = {
    year: searchParams.get("year") || "",
    make: searchParams.get("make") || "",
    model: searchParams.get("model") || "",
    vin: searchParams.get("vin") || "",
    license_plate: searchParams.get("license_plate") || "",
    mileage: searchParams.get("mileage") || "",
    color: searchParams.get("color") || "",
  };

  const initialSession = useMemo(
    () => ({
      id: uuidv4(),
      templateitem: templateName,
      status: "not_started" as InspectionStatus,
      isPaused: false,
      isListening: false,
      transcript: "",
      quote: [],
      customer,
      vehicle,
      sections: [],
    }),
    [templateName],
  );

  const {
    session,
    updateInspection,
    updateItem,
    startSession,
    finishSession,
    resumeSession,
    pauseSession,
    addQuoteLine,
    updateSection,
  } = useInspectionSession(initialSession);

  useEffect(() => {
    startSession(initialSession);
  }, [initialSession]);

  const handleTranscript = async (transcript: string) => {
    setTranscript(transcript);
    const rawCommands: ParsedCommand[] = await interpretCommand(transcript);

    for (const cmd of rawCommands) {
      await handleTranscriptFn({
        command: cmd,
        session,
        updateInspection,
        updateItem,
        updateSection,
        finishSession,
      });
    }
  };

  const startListening = () => {
    const SpeechRecognition =
      typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition);

    if (!SpeechRecognition) {
      console.error("SpeechRecognition API not supported");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const last = event.results.length - 1;
      const transcript = event.results[last][0].transcript;
      handleTranscript(transcript);
    };

    recognition.onerror = (event: Event & { error: string }) => {
      console.error("Speech recognition error:", event.error);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  if (!session || !session.sections || session.sections.length === 0) {
    return <div className="text-white p-4">Loading inspection...</div>;
  }
  return (
    <div className="px-4 pb-12">
      <h1 className="text-2xl font-bold text-center mb-4">{templateName}</h1>

      <div className="flex justify-center gap-4 mb-4">
        <StartListeningButton
          isListening={isListening}
          setIsListening={setIsListening}
          onStart={startListening}
        />

        <PauseResumeButton
          isPaused={isPaused}
          isListening={isListening}
          setIsListening={setIsListening}
          onPause={() => {
            setIsPaused(true);
            pauseSession();
            recognitionRef.current?.stop();
          }}
          onResume={() => {
            setIsPaused(false);
            resumeSession();
            startListening();
          }}
          recognitionInstance={recognitionRef.current}
          setRecognitionRef={(instance) => (recognitionRef.current = instance)}
        />

        <button
          onClick={() => setUnit(unit === "metric" ? "imperial" : "metric")}
          className="bg-zinc-700 text-white px-3 py-2 rounded hover:bg-zinc-600"
        >
          Unit: {unit === "metric" ? "Metric" : "Imperial"}
        </button>
      </div>

      <ProgressTracker
        currentItem={session.currentItemIndex}
        currentSection={session.currentSectionIndex}
        totalSections={session.sections.length}
        totalItems={
          session.sections[session.currentSectionIndex]?.items.length || 0
        }
      />

      {/* Sections */}
      {session.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="mb-8">
          <h2 className="text-xl font-bold mb-2 text-orange-400">
            {section.title}
          </h2>

          {section.items.map((item, itemIndex) => {
            const isSelected = (val: string) => item.status === val;
            const isWheelTorque = item.item
              ?.toLowerCase()
              .includes("wheel torque");

            const handleStatusClick = (val: InspectionItemStatus) => {
              updateItem(sectionIndex, itemIndex, { status: val });

              if ((val === "fail" || val === "recommend") && item.item) {
                addQuoteLine({
                  item: item.item,
                  description: item.notes || "",
                  status: val,
                  value: item.value || "",
                  notes: item.notes || "",
                  laborTime: 0.5,
                  laborRate: 0,
                  parts: [],
                  totalCost: 0,
                  editable: true,
                  source: "inspection",
                  id: "",
                });
              }
            };

            return (
              <div
                key={itemIndex}
                className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700"
              >
                <h3 className="text-lg font-semibold text-white mb-2">
                  {item.item}
                </h3>

                {isWheelTorque ? (
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="number"
                      value={item.value ?? ""}
                      onChange={(e) =>
                        updateItem(sectionIndex, itemIndex, {
                          value: parseFloat(e.target.value),
                          unit: item.unit || "ft lbs",
                        })
                      }
                      className="px-2 py-1 bg-zinc-700 text-white rounded w-32"
                      placeholder="Value"
                    />
                    <input
                      type="text"
                      value={item.unit ?? ""}
                      onChange={(e) =>
                        updateItem(sectionIndex, itemIndex, {
                          unit: e.target.value,
                        })
                      }
                      className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
                      placeholder="Unit"
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {["ok", "fail", "na", "recommend"].map((val) => (
                      <button
                        key={val}
                        className={`px-3 py-1 rounded ${
                          isSelected(val)
                            ? val === "ok"
                              ? "bg-green-600 text-white"
                              : val === "fail"
                                ? "bg-red-600 text-white"
                                : val === "na"
                                  ? "bg-yellow-500 text-white"
                                  : "bg-blue-500 text-white"
                            : "bg-zinc-700 text-gray-300"
                        }`}
                        onClick={() =>
                          handleStatusClick(val as InspectionItemStatus)
                        }
                      >
                        {val.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}

                {(item.status === "fail" || item.status === "recommend") && (
                  <PhotoUploadButton
                    photoUrls={item.photoUrls || []}
                    onChange={(urls: string[]) => {
                      updateItem(sectionIndex, itemIndex, { photoUrls: urls });
                    }}
                  />
                )}

                <textarea
                  value={item.notes ?? ""}
                  onChange={(e) =>
                    updateItem(sectionIndex, itemIndex, {
                      notes: e.target.value,
                    })
                  }
                  className="w-full mt-2 p-2 bg-zinc-700 text-white rounded"
                  rows={2}
                  placeholder="Add notes..."
                />

                {(item.recommend?.length ?? 0) > 0 && (
                  <p className="text-sm text-yellow-400 mt-2">
                    <strong>Recommended:</strong> {item.recommend?.join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Footer Actions */}
      <div className="flex justify-between items-center mt-8 gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
      </div>
    </div>
  );
}
