import { InspectionItem } from '@lib/inspection/types';

export interface SmartHighlightProps {
  item: InspectionItem;
}

export default function SmartHighlight({ item }: SmartHighlightProps) {
  return (
    <div className="text-lg text-white font-bold mb-4 text-center">
      {item.item}
    </div>
  );
}