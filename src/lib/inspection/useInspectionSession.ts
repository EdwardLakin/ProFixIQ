import { useEffect, useState } from "react";
import { InspectionSession, InspectionStatus, InspectionTemplate } from "@lib/inspection/types";
import { defaultInspectionSession } from "@lib/inspection/inspectionState";

export default function useInspectionSession(template: InspectionTemplate) {
  const [session, setSession] = useState<InspectionSession>({
    ...defaultInspectionSession,
    sections: template.sections,
    status: "not_started" as InspectionStatus,
  });

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    setSession((prev) => ({
      ...prev,
      sections: template.sections,
    }));
  }, [template]);

  const updateItem = (
    sectionIndex: number,
    itemIndex: number,
    updates: Partial<InspectionSession["sections"][number]["items"][number]>
  ) => {
    const updatedSections = [...session.sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    updatedSections[sectionIndex].items[itemIndex] = { ...item, ...updates };

    setSession((prev) => ({
      ...prev,
      sections: updatedSections,
    }));
  };

  const addPhotoToItem = (sectionIndex: number, itemIndex: number, url: string) => {
    const updatedSections = [...session.sections];
    const item = updatedSections[sectionIndex].items[itemIndex];
    const updatedPhotos = item.photoUrls ? [...item.photoUrls, url] : [url];
    updatedSections[sectionIndex].items[itemIndex] = { ...item, photoUrls: updatedPhotos };

    setSession((prev) => ({
      ...prev,
      sections: updatedSections,
    }));
  };

  const resetSession = () => {
    setSession({
      ...defaultInspectionSession,
      sections: template.sections,
      status: "not_started",
    });
    setTranscript("");
    setIsListening(false);
  };

  return {
    session,
    setSession,
    isListening,
    setIsListening,
    transcript,
    setTranscript,
    updateItem,
    addPhotoToItem,
    resetSession,
  };
}