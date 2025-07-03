'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@components/ui/Button';
import HomeButton from '@components/ui/HomeButton';
import PreviousButton from '@components/ui/PreviousPageButton';
import PreviousPageButton from '@components/ui/PreviousPageButton';

export default function Maintenance50Start() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex-col items-center justify-center text-white p-6">
      <h1 className="text-4xl font-black tracking-wide text-center mb-8">Maintenance 50 Point</h1>
      <p className="mb-8 text-lg text-center">
        Click below to start your full maintenance inspection.
      </p>

      <Button
        className="text-xl px-8 py-6 bg-orange-600"
        onClick={() => router.push('/inspection/start?template=maintenance50')}
      >
        Start Inspection
      </Button>

      <div className="absolute top-4 left-4">
        <HomeButton />
      </div>
      <div className="absolute top-4 right-4">
        <PreviousPageButton to={''} />
      </div>
    </div>
  );
}