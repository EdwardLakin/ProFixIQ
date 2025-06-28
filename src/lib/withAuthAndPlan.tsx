'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@supabase/auth-helpers-react';
import LoadingSpinner from '@components/ui/LoadingSpinner';

export default function withAuthAndPlan<P>(Component: React.ComponentType<P>) {
  const WrappedComponent: React.FC<P> = (props) => {
    const router = useRouter();
    const session = useSession();

    useEffect(() => {
      if (!session) {
        router.push('/sign-in');
      }
    }, [session]);

    if (!session) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-black">
          <LoadingSpinner />
        </div>
      );
    }

    return <Component {...props} />;
  };

  return WrappedComponent;
}