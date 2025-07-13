// app/inspection/page.tsx (Server Component)
import { withAuthAndPlan } from '@lib/withAuthAndPlan';
import InspectionMenuClient from './InspectionMenuClient';

export default async function InspectionMenuPage() {
  return await withAuthAndPlan({ children: <InspectionMenuClient /> });
}