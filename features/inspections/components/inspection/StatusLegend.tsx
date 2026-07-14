// src/components/inspection/StatusLegend.tsx


const StatusLegend: React.FC = () => {
  return (
    <div className="flex justify-center gap-4 text-sm text-[color:var(--theme-text-secondary)] mb-4">
      <div className="flex items-center gap-1">
        <span className="w-4 h-4 rounded-full bg-green-500 inline-block" /> OK
      </div>
      <div className="flex items-center gap-1">
        <span className="w-4 h-4 rounded-full bg-red-500 inline-block" /> FAIL
      </div>
      <div className="flex items-center gap-1">
        <span className="w-4 h-4 rounded-full bg-yellow-400 inline-block" />{" "}
        Recommend
      </div>
      <div className="flex items-center gap-1">
        <span className="w-4 h-4 rounded-full bg-[color:var(--theme-surface-subtle)] inline-block" /> N/A
      </div>
    </div>
  );
};

export default StatusLegend;
