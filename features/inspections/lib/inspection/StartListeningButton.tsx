"use client";



interface StartListeningButtonProps {
  isListening: boolean;
  setIsListening: (val: boolean) => void;
  onStart: () => void;
}

export default function StartListeningButton(props: any) {
  const { isListening, setIsListening, onStart } =
    props as StartListeningButtonProps;

  const handleStart = () => {
    setIsListening(true);
    onStart(); // Trigger the actual startListening logic from parent
  };

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={isListening}
      className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
    >
      {isListening ? "Listening..." : "Start Listening"}
    </button>
  );
}