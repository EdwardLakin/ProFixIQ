// app/inspection/start/page.tsx

"use client";

import React from "react";
import { useRouter } from "next/navigation";

const InspectionStartPage = () => {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-white font-blackopsone px-4 py-10 flex flex-col items-center justify-center">
      <div className="bg-white/5 backdrop-blur-lg rounded-xl p-8 w-full max-w-md border border-white/10 shadow-lg">
        <h1 className="text-4xl md:text-5xl font-bold text-orange-400 text-center mb-6">
          Start Inspection
        </h1>
        <p className="text-sm md:text-base text-center mb-8 text-gray-300">
          Press the button below to begin your voice-assisted inspection. Say “pause”, “resume”, “add”, “recommend”, or “measurement” at any time.
        </p>
        <button
          onClick={() => router.push("/inspection/session")}
          className="bg-gradient-to-r from-orange-500 to-yellow-500 hover:from-yellow-600 hover:to-orange-600 transition text-black font-bold py-3 px-6 rounded-lg w-full text-lg tracking-wide"
        >
          Start
        </button>
      </div>
    </div>
  );
};

export default InspectionStartPage;