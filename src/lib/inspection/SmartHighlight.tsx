import { InspectionSession } from '@lib/inspection/types';

interface SmartHighlightProps {
  session: InspectionSession;
}

const SmartHighlight = ({ session }: SmartHighlightProps) => {
  return (
    <div className="text-xs text-green-300 text-center mb-2">
      {session.transcript ? `🔊 "${session.transcript}" interpreted` : ''}
    </div>
  );
};

export default SmartHighlight;