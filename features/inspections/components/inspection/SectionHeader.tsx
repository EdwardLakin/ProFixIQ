"use client";

import React from "react";

interface SectionHeaderProps {
  title: string;
  section: number;
}

export default function SectionHeader({ title, section }: SectionHeaderProps) {
  return (
    <div className="text-center my-6">
      <h2 className="text-xl text-gray-300 mb-2">Section {section + 1}</h2>
      <h1 className="text-2xl font-bold text-orange-400 uppercase">{title}</h1>
    </div>
  );
}
