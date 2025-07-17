export default function OnboardingPage() {
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center font-blackops p-4">
      <h1 className="text-3xl text-orange-500 mb-4">Welcome to ProFixIQ!</h1>
      <p className="text-center max-w-md">
        Let’s get started with a few quick setup steps...
      </p>
      {/* Add plan selection, profile setup, etc. here */}
    </div>
  );
}