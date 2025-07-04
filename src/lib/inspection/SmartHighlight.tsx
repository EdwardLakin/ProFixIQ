import { InspectionItem } from '@lib/inspection/types';

interface SmartHighlightProps {
  item: InspectionItem;
}

export default function SmartHighlight({ item }: SmartHighlightProps) {
  // Example rendering
  return (
    <div className="text-sm italic text-gray-400">
      {item?.notes && `AI suggestion: ${item.notes}`}
    </div>
  );
}