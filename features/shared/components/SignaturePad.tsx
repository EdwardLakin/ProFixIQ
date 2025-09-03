// features/shared/components/SignaturePad.tsx
"use client";

import { useRef } from "react";
import SignatureCanvas from "react-signature-canvas";

type Props = {
  onSave: (base64: string) => void;
  onCancel: () => void;
};

export default function SignaturePad(rawProps: any) {
  // Cast internally so Next.js' serializable-props check doesn't run on export type
  const { onSave, onCancel } = rawProps as Props;

  const sigRef = useRef<SignatureCanvas | null>(null);

  const handleClear = () => {
    sigRef.current?.clear();
  };

  const handleSave = () => {
    const canvas = sigRef.current;
    if (!canvas || canvas.isEmpty()) {
      alert("Please draw a signature before saving.");
      return;
    }
    const base64 = canvas.getTrimmedCanvas().toDataURL("image/png");
    onSave(base64);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4 text-center text-gray-800 dark:text-white">
          Sign Below
        </h2>

        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          backgroundColor="white"
          canvasProps={{
            width: 400,
            height: 200,
            className: "border border-gray-300 rounded-md",
          }}
        />

        <div className="mt-4 flex justify-between">
          <button
            onClick={handleClear}
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
          >
            Clear
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Save
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}