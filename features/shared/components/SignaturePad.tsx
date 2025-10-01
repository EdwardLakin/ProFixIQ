
import { useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";

type Props = {
  shopName?: string;                       // branding on the modal
  onSave: (base64: string) => void | Promise<void>;
  onCancel: () => void;
};

export default function SignaturePad({ shopName, onSave, onCancel }: Props) {
  const sigRef = useRef<SignatureCanvas | null>(null);
  const [saving, setSaving] = useState(false);

  const handleClear = () => sigRef.current?.clear();

  const handleSave = async () => {
    if (saving) return;
    const canvas = sigRef.current;
    if (!canvas || canvas.isEmpty()) {
      alert("Please draw a signature before saving.");
      return;
    }
    try {
      setSaving(true);
      const base64 = canvas.getTrimmedCanvas().toDataURL("image/png");
      await onSave(base64);               // parent can be async
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4 text-center text-gray-800 dark:text-white">
          {shopName ? `${shopName} — Customer Approval` : "Sign Below"}
        </h2>

        <SignatureCanvas
          ref={sigRef}
          penColor="black"
          canvasProps={{
            width: 500,
            height: 220,
            className: "border border-gray-300 rounded-md w-full",
            style: { backgroundColor: "white" },
          }}
        />

        <div className="mt-4 flex flex-wrap gap-2 justify-between">
          <button onClick={handleClear} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
            Clear
          </button>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}