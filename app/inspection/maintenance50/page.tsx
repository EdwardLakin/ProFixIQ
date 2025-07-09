'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

import PauseResumeButton from '@lib/inspection/PauseResume';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import ProgressTracker from '@lib/inspection/ProgressTracker';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { saveInspectionSession } from '@lib/inspection/save';
import handleTranscript from '@lib/inspection/handleTranscript';
import interpretCommand from '@components/inspection/interpretCommand';
import { convertParsedCommands } from '@lib/inspection/convertAICommands';
import {
  ParsedCommand,
  InspectionItemStatus,
  InspectionStatus,
} from '@lib/inspection/types';

import { SaveInspectionButton } from '@components/inspection/SaveInspectionButton';
import FinishInspectionButton from '@components/inspection/FinishInspectionButton';
import PreviousPageButton from '@components/ui/PreviousPageButton';

export default function Maintenance50InspectionPage() {
  const searchParams = useSearchParams();
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [parsedCommands, setParsedCommands] = useState<ParsedCommand[]>([]);
  const [isPaused, setIsPaused] = useState(false);

  const startListening = () => {
    const recognition = new (window as any).webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = async (event: any) => {
      const latestTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setTranscript(latestTranscript);

      try {
        const rawCommands = await interpretCommand(latestTranscript);
        const converted = convertParsedCommands(rawCommands, session);
        setParsedCommands(rawCommands); // optional for debugging

        for (const cmd of converted) {
          switch (cmd.type) {
            case 'status':
              updateItem(cmd.sectionIndex, cmd.itemIndex, { status: cmd.status });
              break;

            case 'recommend':
              updateItem(cmd.sectionIndex, cmd.itemIndex, {
                recommend: [
                  ...(session.sections[cmd.sectionIndex].items[cmd.itemIndex].recommend || []),
                  cmd.note ?? '',
                ],
              });
              break;

            case 'add':
              const prevNotes =
                session.sections[cmd.sectionIndex].items[cmd.itemIndex].notes || '';
              updateItem(cmd.sectionIndex, cmd.itemIndex, {
                notes: [prevNotes, cmd.note].filter(Boolean).join('\n'),
              });
              break;

            case 'measurement':
              updateItem(cmd.sectionIndex, cmd.itemIndex, {
                value: cmd.value,
                unit: cmd.unit,
              });
              break;

            case 'pause':
              updateInspection({ isPaused: true });
              break;

            case 'complete':
              finishSession();
              break;

            default:
              console.warn('Unknown AI command:', cmd);
          }
        }
      } catch (error) {
        console.error('Error handling transcript:', error);
      }
    };

    recognition.start();
  };

  const customer = {
    first_name: searchParams.get('first_name') || '',
    last_name: searchParams.get('last_name') || '',
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
    templateName: 'Maintenance 50-Point Inspection',
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
            name: 'Front Left Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Right Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Left Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Right Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Left Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Right Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Left Push Rod Travel',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Right Push Rod Travel',
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
            name: 'Rear Left Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Right Tire Pressure',
            status: '' as InspectionItemStatus,
            unit: 'psi',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Left Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Right Rotor',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Left Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Right Pad',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Left Push Rod Travel',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Right Push Rod Travel',
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
            name: 'Park Brake Lining Left',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Left',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Park Brake Lining Right',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Right',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Park Brake Lining Trans',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Trans',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Wheel Torque Inner',
            status: '' as InspectionItemStatus,
            unit: 'ft lbs',
            value: '',
            notes: '',
            item: 'Inner',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Wheel Torque Outer',
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
            name: 'Engine Oil',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Engine Oil',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Coolant',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Coolant',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Transmission Fluid',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Transmission',
            photoUrls: [],
            recommend: [],
          },
                    {
            name: 'Power Steering Fluid',
            status: '' as InspectionItemStatus,
            unit: 'L',
            value: '',
            notes: '',
            item: 'Steering',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Windshield Washer Fluid',
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
            name: 'Serpentine Belt',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Serpentine',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Timing Belt/Chain',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Timing',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Coolant Hoses',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Coolant Hoses',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Vacuum Hoses',
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
            name: 'Battery Condition',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Battery',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Charging System Output',
            status: '' as InspectionItemStatus,
            unit: 'V',
            value: '',
            notes: '',
            item: 'Charging',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Battery Terminals & Cables',
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
            name: 'Front Brake Pads',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Front Pads',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Front Rotors',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Front Rotors',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Brake Pads',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Rear Pads',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Rotors',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'Rear Rotors',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Brake Lines',
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
            name: 'LF Tread Depth',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'LR Tread Depth',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'LR',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'RF Tread Depth',
            status: '' as InspectionItemStatus,
            unit: 'mm',
            value: '',
            notes: '',
            item: 'RF',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'RR Tread Depth',
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
            name: 'Headlights',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Headlights',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Brake Lights',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Brake Lights',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Turn Signals',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Turn Signals',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Reverse Lights',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Reverse Lights',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Wipers/Washers',
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
            name: 'Front Shocks/Struts',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Front Shocks',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Rear Shocks/Struts',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Rear Shocks',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Ball Joints',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Ball Joints',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Tie Rod Ends',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Tie Rods',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Control Arms/Bushings',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Control Arms',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Wheel Bearings',
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
            name: 'Cabin Air Filter',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Cabin Filter',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Engine Air Filter',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Engine Filter',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Drive Axles/Boots',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Axles',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Exhaust System',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Exhaust',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Underbody Rust',
            status: '' as InspectionItemStatus,
            notes: '',
            item: 'Rust',
            photoUrls: [],
            recommend: [],
          },
          {
            name: 'Fluid Leaks',
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

  return (
  <div className="text-white max-w-3xl mx-auto">
    <PreviousPageButton to="/inspection" />

    <h1 className="text-2xl font-bold text-center mb-4">
      Maintenance 50-Point Inspection
    </h1>

    <StartListeningButton
      isListening={isListening}
      setIsListening={setIsListening}
    />

    <PauseResumeButton
      isPaused={session.isPaused}
      onPause={pauseSession}
      onResume={resumeSession}
    />

    <ProgressTracker
      currentItem={session.currentItemIndex}
      currentSection={session.currentSectionIndex}
      totalSections={session.sections.length}
      totalItems={
        session.sections[session.currentSectionIndex]?.items.length || 0
      }
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

    <SmartHighlight
  item={session.sections[session.currentSectionIndex].items[session.currentItemIndex]}
  sectionIndex={session.currentSectionIndex}
  itemIndex={session.currentItemIndex}
  session={session}
  updateItem={updateItem}
  updateInspection={updateInspection}
  updateSection={updateSection}
  finishSession={finishSession}
  onCommand={(cmd: ParsedCommand) =>
    handleTranscript({
      command: cmd,
      session,
      updateInspection,
      updateItem,
      updateSection,
      finishSession,
      sectionIndex: session.currentSectionIndex,
      itemIndex: session.currentItemIndex,
    })
  }
  interpreter={async (transcript: string) => {
    return await interpretCommand(transcript);
    const parsed = await interpretCommand(transcript);
    for (const command of parsed) {
      await handleTranscript({
        command,
        session,
        updateInspection,
        updateItem,
        updateSection,
        finishSession,
        sectionIndex: session.currentSectionIndex,
        itemIndex: session.currentItemIndex,
      });
    }
  }}
  transcript={session.transcript ?? ''}
/>

    {/* Render your inspection sections + items below this if needed */}
   {session.sections.map((section, sectionIndex) => {
  const isMeasurementOnly = ['Axle 1', 'Axle 2'].includes(section.title);
  const leftItems = section.items.filter((item) =>
    item.name?.toLowerCase().includes('left')
  );
  const rightItems = section.items.filter((item) =>
    item.name?.toLowerCase().includes('right')
  );
  const centerItems = section.items.filter(
    (item) =>
      !item.name?.toLowerCase().includes('left') &&
      !item.name?.toLowerCase().includes('right')
  );

  return (
    <div key={sectionIndex} className="mb-8">
      <h2 className="text-xl font-bold mb-2 text-orange-400">{section.title}</h2>

      {isMeasurementOnly ? (
        <>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[45%]">
              {leftItems.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700"
                >
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {item.name}
                  </h3>
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="number"
                      value={item.value ?? ''}
                      onChange={(e) =>
                        updateItem(sectionIndex, itemIndex, {
                          value: parseFloat(e.target.value),
                          unit: item.unit || 'mm',
                        })
                      }
                      className="px-2 py-1 bg-zinc-700 text-white rounded w-24"
                      placeholder="Value"
                    />
                    <input
                      type="text"
                      value={item.unit ?? ''}
                      onChange={(e) =>
                        updateItem(sectionIndex, itemIndex, {
                          unit: e.target.value,
                        })
                      }
                      className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
                      placeholder="Unit"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex-1 min-w-[45%]">
              {rightItems.map((item, itemIndex) => (
                <div
                  key={itemIndex}
                  className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700"
                >
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {item.name}
                  </h3>
                  <div className="flex items-center space-x-2 mb-3">
                    <input
                      type="number"
                      value={item.value ?? ''}
                      onChange={(e) =>
                        updateItem(sectionIndex, itemIndex, {
                          value: parseFloat(e.target.value),
                          unit: item.unit || 'mm',
                        })
                      }
                      className="px-2 py-1 bg-zinc-700 text-white rounded w-24"
                      placeholder="Value"
                    />
                    <input
                      type="text"
                      value={item.unit ?? ''}
                      onChange={(e) =>
                        updateItem(sectionIndex, itemIndex, {
                          unit: e.target.value,
                        })
                      }
                      className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
                      placeholder="Unit"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {centerItems.map((item, itemIndex) => (
            <div
              key={itemIndex}
              className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700"
            >
              <h3 className="text-lg font-semibold text-white mb-2">{item.name}</h3>
              <div className="flex items-center space-x-2 mb-3">
                <input
                  type="number"
                  value={item.value ?? ''}
                  onChange={(e) =>
                    updateItem(sectionIndex, itemIndex, {
                      value: parseFloat(e.target.value),
                      unit: item.unit || 'mm',
                    })
                  }
                  className="px-2 py-1 bg-zinc-700 text-white rounded w-24"
                  placeholder="Value"
                />
                <input
                  type="text"
                  value={item.unit ?? ''}
                  onChange={(e) =>
                    updateItem(sectionIndex, itemIndex, {
                      unit: e.target.value,
                    })
                  }
                  className="px-2 py-1 bg-zinc-700 text-white rounded w-20"
                  placeholder="Unit"
                />
              </div>
            </div>
          ))}
        </>
      ) : (
        section.items.map((item, itemIndex) => {
          const isSelected = (val: string) => item.status === val;
          const isWheelTorque = item.name?.toLowerCase().includes('wheel torque');

          return (
            <div
              key={itemIndex}
              className="bg-zinc-800 p-4 rounded mb-4 border border-zinc-700"
            >
              <h3 className="text-lg font-semibold text-white mb-2">
                {item.name}
              </h3>

              {isWheelTorque ? (
                <div className="flex items-center space-x-2 mb-3">
                  <input
                    type="number"
                    value={item.value ?? ''}
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
                    value={item.unit ?? ''}
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
                        updateItem(sectionIndex, itemIndex, { status: val as InspectionItemStatus })
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

              {item.notes && (
                <p className="text-sm text-gray-400 mt-2 whitespace-pre-wrap">
                  <strong>Notes:</strong> {item.notes}
                </p>
              )}

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