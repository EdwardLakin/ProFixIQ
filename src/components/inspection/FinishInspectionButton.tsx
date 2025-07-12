'use client';

import { useRouter } from 'next/navigation';
import { Button }from '@components/ui/Button';
import  useInspectionSession  from '@lib/inspection/useInspectionSession';
import { saveInspectionSession } from '@lib/inspection/save';
import { generateInspectionSummary } from '@lib/inspection/summary';

export default function FinishInspectionButton() {
  const router = useRouter();
  const { session, finishSession } = useInspectionSession();

  const handleFinish = async () => {
    finishSession(); // Mark session as complete

    const summary = generateInspectionSummary(session); // Generate editable summary
    console.log(summary); // Optional: for debugging

    await saveInspectionSession(session); // Save full session to DB

    router.push('/app/inspection/summary'); // Navigate to summary screen
  };

  return (
    <Button
      onClick={handleFinish}
      className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded"
    >
      Finish Inspection
    </Button>
  );
}