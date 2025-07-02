// components/inspection/StartListeningButton.tsx

type StartListeningButtonProps = {
  onStart: () => void;
  isPaused: boolean;
  onPause: () => void;
  onResume: () => void;
};

export default function StartListeningButton({
  onStart,
  isPaused,
  onPause,
  onResume,
}: StartListeningButtonProps) {
  return (
    <div className="flex flex-col items-center gap-2 mb-4">
      <button
        onClick={onStart}
        className="bg-orange-600 text-white px-6 py-2 rounded font-blackops text-lg"
      >
        Start Listening
      </button>
      <div className="flex gap-4">
        {!isPaused ? (
          <button
            onClick={onPause}
            className="bg-red-600 text-white px-4 py-1 rounded text-sm"
          >
            Pause
          </button>
        ) : (
          <button
            onClick={onResume}
            className="bg-green-600 text-white px-4 py-1 rounded text-sm"
          >
            Resume
          </button>
        )}
      </div>
    </div>
  );
}