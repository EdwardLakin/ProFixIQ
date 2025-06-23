'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@supabase/auth-helpers-react';
import withAuthAndPlan from '@/lib/withAuthAndPlan';

function WorkOrdersPage() {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session) {
      router.replace('/sign-in');
    }
  }, [session, router]);

  return (
    <div className="min-h-screen p-8 text-white">
      <h1 className="text-4xl font-blackops text-orange-400 mb-6">
        Work Orders
      </h1>
      <p className="text-lg text-neutral-300">
        This is where you'll manage all your repair jobs.
      </p>
      {/* You can insert table, job queue, or work order cards here */}
    </div>
  );
}

export default withAuthAndPlan(WorkOrdersPage, ['pro', 'proPlus']);