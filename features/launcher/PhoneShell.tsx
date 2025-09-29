// PhoneShell component
"use client";
import React from "react";

export default function PhoneShell({ children }:{ children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[color:var(--bg,#0b0f13)]">
      <div className="mx-auto w-full md:max-w-[420px] md:mt-6 md:rounded-[42px] md:border-8 md:border-black md:shadow-2xl">
        {children}
      </div>
    </div>
  );
}