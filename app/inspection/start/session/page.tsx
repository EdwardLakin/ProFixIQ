// app/inspection/session/page.tsx

"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const InspectionSessionPage = () => {
  const [transcript, setTranscript] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "listening" | "paused">("idle");
  const router = useRouter();

  // Placeholder for voice recognition mockup
  useEffect(() => {
    if (status === "listening") {
      const timeout = setTimeout(() => {
        setTranscript("Left front tire pressure 80 psi, tread depth 6mm.");
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [status]);

  const handleCommand = (cmd: string) => {
    if (cmd === "pause") setStatus("paused");
    else if (cmd === "resume") setStatus("listening");
    else if (cmd === "complete") router.push("/inspection/review");
    // Add logic for “add”, “measurement”, “recommend”, etc.
  };

  return (
    <div className="min-h-screen bg-black text-white font-blackopsone px-4 py-10 flex flex-col items-center justify-center">
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-6 w-full max-w-2xl border border-white/10 shadow-lg">
        <h1 className="text-4xl text-orange-400 text-center mb-6">Inspection Session</h1>

        <div className="text-center mb-4">
          <p className="text-sm text-gray-400">Status: {status}</p>
          <p className="text-md mt-2 text-white/90 italic">{transcript || "Listening for commands..."}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {["pause", "resume", "add", "measurement", "recommend", "complete"].map((cmd) => (
            <button
              key={cmd}
              onClick={() => handleCommand(cmd)}
              className="border border-orange-400 text-orange-300 hover:bg-orange-600 hover:text-black transition py-2 px-4 rounded-lg font-bold"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default InspectionSessionPage;