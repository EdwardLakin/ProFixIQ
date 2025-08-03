'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

import PauseResumeButton from '@lib/inspection/PauseResume';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import ProgressTracker from '@lib/inspection/ProgressTracker';
import useInspectionSession from '@lib/inspection/useInspectionSession';

import { handleTranscriptFn } from '@lib/inspection/handleTranscript';
import { interpretCommand }from '@components/inspection/interpretCommand';
import { convertParsedCommands } from '@lib/inspection/convertAICommands';
import { Command } from '@lib/inspection/types';
import type { InspectionSession } from '@lib/inspection/types'; // adjust path as needed

import {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
} from '@lib/inspection/types';

import { SaveInspectionButton } from '@components/inspection/SaveInspectionButton';
import FinishInspectionButton from '@components/inspection/FinishInspectionButton';

import { v4 as uuidv4 } from 'uuid';


declare global {
  interface Window {
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

const id = uuidv4();

export default function Maintenance50InspectionPage() {
  const searchParams = useSearchParams();
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedCommands, setParsedCommands] = useState<ParsedCommand[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const customer = {
    first_item: searchParams.get('first_name') || '',
    last_item: searchParams.get('last_name') || '',
    phone: searchParams.get('phone') || '',
    email: searchParams.get('email') || '',
  };

  const vehicle = {
    year: searchParams.get('year') || '',
    make: searchParams.get('make') || '',
    model: searchParams.get('model') || '',
    vin: searchParams.get('vin') || '',
    license_plate: searchParams.get('license_plate') || '',
    mileage: searchParams.get('mileage') || '',
    color: searchParams.get('color') || '',
  };

  const initialSession = useMemo(() => ({
    id: uuidv4(),
    templateitem: 'Maintenance 50-Point Inspection',
    status: 'not_started' as InspectionStatus,
    isPaused: false,
    isListening: false,
    transcript: '',
    quote: [],
    customer: {
      ...customer,
      address: '',
      city: '',
      province: '',
      postal_code: '',
    },
    vehicle,
    sections: [
      {
        title: 'Axle 1',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Front Left Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Left Tire Tread Depth',
            status: '' as InspectionItemStatus,
            value: '',
            unit: 'mm',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Right Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Right Tire Tread Depth',
            status: '' as InspectionItemStatus,
            value: '',
            unit: 'mm',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Left Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Right Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Left Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Right Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Left Push Rod Travel',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Right Push Rod Travel',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
            {
        title: 'Axle 2',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Rear Left Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Left Tire Tread Depth',
            status: '' as InspectionItemStatus,
            value: '',
            unit: 'mm',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Right Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Right Tire Tread Depth',
            status: '' as InspectionItemStatus,
            value: '',
            unit: 'mm',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Left Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Right Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Left Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Right Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Left Push Rod Travel',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Right Push Rod Travel',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Park Brake & Torque',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Park Brake Lining Left',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Left',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Park Brake Lining Right',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Right',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Park Brake Lining Trans',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Trans',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Wheel Torque Inner',
            status: '' as InspectionItemStatus,
            unit: 'ft lbs',
            value: '',
            notes: '',
            item: 'Inner',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Wheel Torque Outer',
            status: '' as InspectionItemStatus,
            unit: 'ft lbs',
            value: '',
            notes: '',
            item: 'Outer',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Fluids',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Engine Oil',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Engine Oil',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Coolant',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Coolant',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Transmission Fluid',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Transmission',
            photoUrls: [],
            recommend: [],
          },
                    {
            item: 'Power Steering Fluid',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Steering',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Windshield Washer Fluid',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Washer',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Belts & Hoses',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Serpentine Belt',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Serpentine',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Timing Belt/Chain',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Timing',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Coolant Hoses',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Coolant Hoses',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Vacuum Hoses',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Vacuum',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Battery & Charging',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Battery Condition',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Battery',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Charging System Output',
            status: '' as InspectionItemStatus,
            unit: 'V',
            value: '',
            notes: '',
            item: 'Charging',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Battery Terminals & Cables',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Terminals',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Brakes',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Front Brake Pads',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Front Pads',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Front Rotors',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Front Rotors',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Brake Pads',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Rear Pads',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Rotors',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Rear Rotors',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Brake Lines',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Brake Lines',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Tires',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'LF Tread Depth',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'LR Tread Depth',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'RF Tread Depth',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'RR Tread Depth',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
            {
        title: 'Lights & Electronics',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Headlights',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Headlights',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Brake Lights',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Brake Lights',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Turn Signals',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Turn Signals',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Reverse Lights',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Reverse Lights',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Wipers/Washers',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Wipers',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Suspension & Steering',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Front Shocks/Struts',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Front Shocks',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Rear Shocks/Struts',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Rear Shocks',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Ball Joints',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Ball Joints',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Tie Rod Ends',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Tie Rods',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Control Arms/Bushings',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Control Arms',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Wheel Bearings',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Bearings',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
      {
        title: 'Other Items',
        status: '' as InspectionItemStatus,
        notes: '',
        items: [
          {
            item: 'Cabin Air Filter',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Cabin Filter',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Engine Air Filter',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Engine Filter',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Drive Axles/Boots',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Axles',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Exhaust System',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Exhaust',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Underbody Rust',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Rust',
            photoUrls: [],
            recommend: [],
          },
          {
            item: 'Fluid Leaks',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Leaks',
            photoUrls: [],
            recommend: [],
          },
        ],
      },
    ],
  }), [searchParams]);

  const {
    session,
    updateInspection,
    updateItem,
    startSession,
    finishSession,
    resumeSession,
    pauseSession,
    addQuoteLine,
    updateSection,
  } = useInspectionSession(initialSession);

  useEffect(() => {
    startSession(initialSession);
  }, [initialSession]);

  if (!session || !session.sections || session.sections.length === 0) {
    console.warn('Session not loaded or missing sections:', session);
    return <div className="text-white p-4">Loading inspection...</div>;
  }

  const handleTranscript = async (transcript: string) => {
    setTranscript(transcript);
    const rawCommands: ParsedCommand[] = await interpretCommand(transcript);
    const converted: Command[] = convertParsedCommands(rawCommands, session);
    for (const cmd of rawCommands) {
      await handleTranscriptFn({
        command: cmd,
        session,
        updateInspection,
        updateItem,
        updateSection,
        finishSession,
      });
    }
  };

  const startListening = () => {
  const SpeechRecognition =
    typeof window !== 'undefined'
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : undefined;

  if (!SpeechRecognition) {
    console.error('SpeechRecognition is not supported in this browser.');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    const lastResultIndex = event.results.length - 1;
    const transcript = event.results[lastResultIndex][0].transcript;
    handleTranscript(transcript);
  };

  recognition.onerror = (event: SpeechRecognitionEvent) => {
    console.error('Speech recognition error:', event.error);
  };

  recognitionRef.current = recognition;
  recognition.start();
  setIsListening(true);
};

return (
  <div className="px-4">
    <h1 className="text-2xl font-bold text-center mb-4">
      Maintenance 50-Point Inspection
    </h1>

    <StartListeningButton
      isListening={isListening}
      setIsListening={setIsListening}
      onStart={startListening}
    />

    <PauseResumeButton
      isPaused={isPaused}
      isListening={isListening}
      setIsListening={setIsListening}
      onPause={() => {
        setIsPaused(true);
        stopListening();
      }}
      onResume={() => {
        setIsPaused(false);
        startListening();
      }}
      recognitionInstance={recognitionRef.current}
      setRecognitionRef={(instance) => (recognitionRef.current = instance)}
    />

      <ProgressTracker
  currentItem={session.currentItemIndex}
  currentSection={session.currentSectionIndex}
  totalSections={session.sections.length}
  totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
/>

<div className="bg-zinc-900 p-4 rounded mb-4">
  <h2 className="text-lg font-semibold text-orange-400 mb-2">Customer Info</h2>
  <p>{session.customer?.first_name} {session.customer?.last_name}</p>
  <p>{session.customer?.phone} | {session.customer?.email}</p>
</div>

<div className="bg-zinc-900 p-4 rounded mb-6">
  <h2 className="text-lg font-semibold text-orange-400 mb-2">Vehicle Info</h2>
  <p>{session.vehicle?.year} {session.vehicle?.make} {session.vehicle?.model}</p>
  <p>VIN: {session.vehicle?.vin} | Plate: {session.vehicle?.license_plate}</p>
  <p>Mileage: {session.vehicle?.mileage} | Color: {session.vehicle?.color}</p>
</div>

{session.sections.map((section, sectionIndex) => {
  const isAxle = ['axle 1', 'axle 2'].includes(section.title.toLowerCase());
  const leftItems = section.items.filter((item) =>
    item.name.toLowerCase().includes('left')
  );
  const rightItems = section.items.filter((item) =>
    item.name.toLowerCase().includes('right')
  );

        return (
  <div key={sectionIndex} className="mb-8">
    <h2 className="text-xl font-bold mb-2 text-orange-400">{section.title}</h2>

    {isAxle ? (
      <div className="flex flex-col md:flex-row gap-4">
        {/* LEFT */}
        <div className="w-full md:w-1/2">
          {leftItems.map((item, idx) => (
            <div key={idx} className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700">
              <h3 className="text-lg font-semibold text-white mb-2">{item.name}</h3>
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="number"
                  value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                  onChange={(e) =>
                    updateItem(sectionIndex, section.items.indexOf(item), {
                      value: parseFloat(e.target.value),
                      unit: item.unit || 'mm',
                    })
                  }
                  className="px-2 py-1 bg-zinc-700 text-white rounded w-24"
                  placeholder="Value"
                />
                <input
                  type="text"
                  value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                  onChange={(e) =>
                    updateItem(sectionIndex, section.items.indexOf(item), {
                      unit: e.target.value,
                    })
                  }
                  className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
                  placeholder="Unit"
                />
              </div>
              <textarea
                value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                onChange={(e) =>
                  updateItem(sectionIndex, section.items.indexOf(item), {
                    notes: e.target.value,
                  })
                }
                className="w-full mt-2 p-2 bg-zinc-700 text-white rounded"
                rows={2}
                placeholder="Add notes..."
              />
            </div>
          ))}
        </div>

        {/* RIGHT */}
        <div className="flex-1">
          {rightItems.map((item, idx) => (
            <div key={idx} className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700">
              <h3 className="text-lg font-semibold text-white mb-2">{item.name}</h3>
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="number"
                  value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                  onChange={(e) =>
                    updateItem(sectionIndex, section.items.indexOf(item), {
                      value: parseFloat(e.target.value),
                      unit: item.unit || 'mm',
                    })
                  }
                  className="px-2 py-1 bg-zinc-700 text-white rounded w-24"
                  placeholder="Value"
                />
                <input
                  type="text"
                  value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                  onChange={(e) =>
                    updateItem(sectionIndex, section.items.indexOf(item), {
                      unit: e.target.value,
                    })
                  }
                  className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
                  placeholder="Unit"
                />
              </div>
              <textarea
                value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                onChange={(e) =>
                  updateItem(sectionIndex, section.items.indexOf(item), {
                    notes: e.target.value,
                  })
                }
                className="w-full mt-2 p-2 bg-zinc-700 text-white rounded"
                rows={2}
                placeholder="Add notes..."
              />
            </div>
          ))}
        </div>
      </div>
    ) : (

        section.items.map((item, itemIndex) => {
          const isSelected = (val: string) => item.status === val;
          const isWheelTorque = item.name?.toLowerCase().includes('wheel torque');

          return (
            <div
              key={itemIndex}
              className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700"
            >
              <h3 className="text-lg font-semibold text-white mb-2">{item.name}</h3>

              {isWheelTorque ? (
                <div className="flex items-center space-x-2 mb-3">
                  <input
                    type="number"
                    value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                    onChange={(e) =>
                      updateItem(sectionIndex, itemIndex, {
                        value: parseFloat(e.target.value),
                        unit: item.unit || 'ft lbs',
                      })
                    }
                    className="px-2 py-1 bg-zinc-700 text-white rounded w-32"
                    placeholder="Value"
                  />
                  <input
                    type="text"
                    value={item.value !== null && item.value !== undefined ? String(item.value) : ''}
                    onChange={(e) =>
                      updateItem(sectionIndex, itemIndex, {
                        unit: e.target.value,
                      })
                    }
                    className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
                    placeholder="Unit"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 mb-3">
                  {['ok', 'fail', 'na', 'recommend'].map((val) => (
                    <button
                      key={val}
                      className={`px-3 py-1 rounded ${
                        isSelected(val)
                          ? val === 'ok'
                            ? 'bg-green-600 text-white'
                            : val === 'fail'
                            ? 'bg-red-600 text-white'
                            : val === 'na'
                            ? 'bg-yellow-500 text-white'
                            : 'bg-blue-500 text-white'
                          : 'bg-zinc-700 text-gray-300'
                      }`}
                      onClick={() =>
                        updateItem(sectionIndex, itemIndex, {
                          status: val as InspectionItemStatus,
                        })
                      }
                    >
                      {val.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}

              {(item.status === 'fail' || item.status === 'recommend') && (
                <PhotoUploadButton
                  photoUrls={item.photoUrls || []}
                  onChange={(urls: string[]) => {
                    updateItem(sectionIndex, itemIndex, { photoUrls: urls });
                  }}
                />
              )}

              <textarea
                value={item.notes ?? ''}
                onChange={(e) =>
                  updateItem(sectionIndex, itemIndex, {
                    notes: e.target.value,
                  })
                }
                className="w-full mt-2 p-2 bg-zinc-700 text-white rounded"
                rows={2}
                placeholder="Add notes..."
              />

              {(item.recommend?.length ?? 0) > 0 && (
                <p className="text-sm text-yellow-400 mt-2">
                  <strong>Recommended:</strong> {item.recommend?.join(', ')}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );
})}

<div className="flex justify-between items-center mt-8 gap-4">
  <SaveInspectionButton />
  <FinishInspectionButton />
</div>
</div>
);
}