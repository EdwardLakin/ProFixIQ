'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@supabase/auth-helpers-react';
import useUser from '@/hooks/useUser';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function withAuthAndPlan<P extends object>(
  Component: React.ComponentType<P>,
  requiredPlans: string[] = []
): React.FC<P> {
  const WrappedComponent: React.FC<P> = (props: P) => {
    const router = useRouter();
    const session = useSession();
    const { user, isLoading: userLoading } = useUser();

    const plan = user?.plan;
    const isAuthorized =
      requiredPlans.length === 0 || requiredPlans.includes(plan);

    useEffect(() => {
      if (!session && !userLoading) {
        router.push('/sign-in');
      }
    }, [session, userLoading, router]);

    if (!session || userLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-black">
          <LoadingSpinner />
        </div>
      );
    }

    if (!isAuthorized) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
          <h1 className="text-3xl font-bold">Access Denied</h1>
          <p className="mt-2 text-lg">
            Your current plan doesn’t grant access to this feature.
          </p>
        </div>
      );
    }

    return <Component {...props} />;
  };

  return WrappedComponent;
}