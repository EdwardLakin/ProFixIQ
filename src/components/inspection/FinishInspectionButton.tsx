'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@components/ui/Button';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import maintenance50Point from '@lib/inspection/templates/maintenance50Point';

export default function FinishInspectionButton() {
  const router = useRouter();

  // Only use the template if the session is uninitialized
  const { session, finishSession } = useInspectionSession();

  const handleFinish = () => {
    finishSession();
    router.push('/app/inspection/summary');
  };

  return (
    <Button
      onClick={handleFinish}
      className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded w-full mt-4"
    >
      Finish Inspection
    </Button>
  );
}