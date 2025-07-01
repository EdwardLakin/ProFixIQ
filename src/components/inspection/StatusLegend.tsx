// components/inspection/StatusLegend.tsx
export default function StatusLegend() {
  return (
    <div className="text-white text-sm mb-4 max-w-xl mx-auto bg-black/40 backdrop-blur-md p-3 rounded-md shadow-md">
      <h4 className="font-bold mb-2">🗂️ Status Key</h4>
      <ul className="flex flex-wrap gap-4">
        <li className="flex items-center gap-1"><span>✅</span>OK</li>
        <li className="flex items-center gap-1"><span>❌</span>Fail</li>
        <li className="flex items-center gap-1"><span>⚠️</span>Recommend</li>
        <li className="flex items-center gap-1"><span>⛔</span>N/A</li>
      </ul>
    </div>
  );
}