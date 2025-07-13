import { getUserSession } from '@lib/getUserSession';
import { redirect } from 'next/navigation';

export async function withAuthAndPlan({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, plan } = await getUserSession();

  if (!user) {
    console.warn('🚫 No user found – redirecting to /sign-in');
    redirect('/sign-in');
  }

  const allowedPlans = ['pro', 'pro_plus'];
  if (!allowedPlans.includes(plan)) {
    console.warn(`🚫 Plan "${plan}" is restricted – redirecting to /upgrade`);
    redirect('/upgrade');
  }

  return <>{children}</>;
}