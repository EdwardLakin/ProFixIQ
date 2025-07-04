'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@components/ui/Button';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { saveInspectionSession } from '@lib/inspection/save';

export default function FinishInspectionButton() {
  const router = useRouter();
  const { session, finishSession } = useInspectionSession();

  const handleFinish = async () => {
    finishSession(); // Mark inspection as completed and generate quotes
    await saveInspectionSession(session); // Save to Supabase
    router.push('/app/inspection/summary'); // Navigate to summary
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