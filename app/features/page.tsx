import { features } from '@/lib/plan/features';
import { useFeatureAccess } from '@/hooks/useFeatureAccess';
import FeatureCard from '@/components/ui/FeatureCard';

export default function FeaturesPage() {
  return (
    <div>
      <h1>ProFixIQ Features</h1>
      <div className="grid">
        {features.map((feature) => {
          const { allowed } = useFeatureAccess(feature.key);
          return (
            <FeatureCard
              key={feature.key}
              title={feature.title}
              description={feature.description}
              available={allowed}
              className=""
            />
          );
        })}
      </div>
    </div>
  );
}