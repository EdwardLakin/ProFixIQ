'use client';

import { useRouter } from 'next/navigation';
import { Button }from '@components/ui/Button';
import  useInspectionSession  from '@lib/inspection/useInspectionSession';
import { saveInspectionSession } from '@lib/inspection/save';
import { generateInspectionSummary } from '@lib/inspection/generateInspectionSummary';

export default function FinishInspectionButton() {
  const router = useRouter();
  const { session, finishSession } = useInspectionSession();

  const handleFinish = async () => {
  try {
    finishSession(); // Mark session complete

    const summary = generateInspectionSummary(session);
    console.log(summary); // Optional: debug

    await saveInspectionSession(session); // Save to Supabase

    // ✅ Navigate after successful save
    router.push('/app/inspection/summary');
  } catch (error) {
    console.error('Failed to finish inspection:', error);
    alert('Failed to finish inspection. Please try again.');
  }
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