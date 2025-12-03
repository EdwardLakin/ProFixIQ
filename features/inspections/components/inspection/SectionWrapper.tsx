// components/inspection/SectionWrapper.tsx
import React, { useState } from "react";

interface SectionWrapperProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

const SectionWrapper: React.FC<SectionWrapperProps> = ({
  title,
  children,
  defaultOpen = true,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-4 rounded-lg bg-black/40 p-4 shadow-md">
      <button
        className="w-full text-left font-black text-lg text-orange-400 mb-2 flex justify-between items-center"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{title}</span>
        <span>{isOpen ? "−" : "+"}</span>
      </button>
      {isOpen && <div className="space-y-2">{children}</div>}
    </div>
  );
};

export default SectionWrapper;
