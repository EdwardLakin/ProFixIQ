'use client';

import PauseResumeButton from '@lib/inspection/PauseResume';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import ProgressTracker from '@lib/inspection/ProgressTracker';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { saveInspectionSession }from '@lib/inspection/save';
import interpretCommand from '@components/inspection/interpretCommand';
import handleTranscript from '@lib/inspection/handleTranscript';
import { InspectionItemStatus } from '@lib/inspection/types';

import {
  InspectionStatus
} from '@lib/inspection/types';

import PreviousPageButton from '@components/ui/PreviousPageButton';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export default function Maintenance50InspectionPage() {
  const searchParams = useSearchParams();
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
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

  localStorage.setItem('inspectionCustomer', JSON.stringify(customer));
  localStorage.setItem('inspectionVehicle', JSON.stringify(vehicle));
}, [searchParams]);

  const {
    session,
    updateInspection,
    updateItem,
    updateSection,
    startSession,
    finishSession,
    isPaused,
    resumeSession,
    pauseSession,
    addQuoteLine,
  } = useInspectionSession(
     {
    templateName: 'Maintenance 50-Point Inspection',
    status: 'not_started',
    isPaused: false,
    isListening: false,
    transcript: '',
    quote: [],
    customer: {
      first_name: searchParams.get('first_name') || '',
      last_name: searchParams.get('last_name') || '',
      phone: searchParams.get('phone') || '',
      email: searchParams.get('email') || '',
      address: '',
      city: '',
      province: '',
      postal_code: '',
    },
    vehicle: {
      year: searchParams.get('year') || '',
      make: searchParams.get('make') || '',
      model: searchParams.get('model') || '',
      vin: searchParams.get('vin') || '',
      license_plate: searchParams.get('license_plate') || '',
      mileage: searchParams.get('mileage') || '',
      color: searchParams.get('color') || '',
    },
    sections: [
  {
    title: 'Axle 1',
    status: '',
    notes: '',
    items: [
      {
        name: 'Front Left Tire Pressure', status: '', unit: 'psi', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Front Right Tire Pressure', status: '', unit: 'psi', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Front Left Rotor', status: '', unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Front Right Rotor', status: '', unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
        
      },
      {
        name: 'Front Left Pad', status: '', unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
        
      },
      {
        name: 'Front Right Pad', status: '', unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Front Left Push Rod Travel', status: '', unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Front Right Push Rod Travel', status: '', unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
    
      },
    ]
  },
  {
    title: 'Axle 2',
    status: '',
    notes: '',
    items: [
      {
        name: 'Rear Left Tire Pressure', status: '', unit: 'psi', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
  
      },
      {
        name: 'Rear Right Tire Pressure', status: '', unit: 'psi', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Left Rotor', status: '', unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Right Rotor', status: '', unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Left Pad', status: '', unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Right Pad', status: '', unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Rear Left Push Rod Travel', status: '', unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Right Push Rod Travel', status: '', unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
        
      },
    ]
  },
  {
    title: 'Park Brake & Torque',
    status: '',
    notes: '',
    items: [
      {
        name: 'Park Brake Lining Left', status: '', unit: 'mm', value: '', notes: '', item: 'Left', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Park Brake Lining Right', status: '', unit: 'mm', value: '', notes: '', item: 'Right', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Park Brake Lining Trans', status: '', unit: 'mm', value: '', notes: '', item: 'Trans', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Wheel Torque Inner', status: '', unit: 'ft lbs', value: '', notes: '', item: 'Inner', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Wheel Torque Outer', status: '', unit: 'ft lbs', value: '', notes: '', item: 'Outer', photoUrls: [], recommend: [],
      
      },
    ]
  },
  {
  title: 'Fluids',
  status: '',
  notes: '',
  items: [
    {
      name: 'Engine Oil', status: '', unit: 'L', value: '', notes: '', item: 'Engine Oil', photoUrls: [], recommend: [],

    },
    {
      name: 'Coolant', status: '', unit: 'L', value: '', notes: '', item: 'Coolant', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Transmission Fluid', status: '', unit: 'L', value: '', notes: '', item: 'Transmission', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Power Steering Fluid', status: '', unit: 'L', value: '', notes: '', item: 'Steering', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Windshield Washer Fluid', status: '', unit: 'L', value: '', notes: '', item: 'Washer', photoUrls: [], recommend: [],

    },
  ]
},
{
  title: 'Belts & Hoses',
  status: '',
  notes: '',
  items: [
    {
      name: 'Serpentine Belt', status: '', notes: '', item: 'Serpentine', photoUrls: [], recommend: [],
  
    },
    {
      name: 'Timing Belt/Chain', status: '', notes: '', item: 'Timing', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Coolant Hoses', status: '', notes: '', item: 'Coolant Hoses', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Vacuum Hoses', status: '', notes: '', item: 'Vacuum', photoUrls: [], recommend: [],
    
    },
  ]
},
{
  title: 'Battery & Charging',
  status: '',
  notes: '',
  items: [
    {
      name: 'Battery Condition', status: '', notes: '', item: 'Battery', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Charging System Output', status: '', unit: 'V', value: '', notes: '', item: 'Charging', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Battery Terminals & Cables', status: '', notes: '', item: 'Terminals', photoUrls: [], recommend: [],
    
    },
  ]
},
{
  title: 'Brakes',
  status: '',
  notes: '',
  items: [
    {
      name: 'Front Brake Pads', status: '', unit: 'mm', value: '', notes: '', item: 'Front Pads', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Front Rotors', status: '', unit: 'mm', value: '', notes: '', item: 'Front Rotors', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Rear Brake Pads', status: '', unit: 'mm', value: '', notes: '', item: 'Rear Pads', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Rear Rotors', status: '', unit: 'mm', value: '', notes: '', item: 'Rear Rotors', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Brake Lines', status: '', notes: '', item: 'Brake Lines', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Tires',
  status: '',
  notes: '',
  items: [
    {
      name: 'LF Tread Depth', status: '', unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
    
    },
    {
      name: 'LR Tread Depth', status: '', unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
      
    },
    {
      name: 'RF Tread Depth', status: '', unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
      
    },
    {
      name: 'RR Tread Depth', status: '', unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Lights & Electronics',
  status: '',
  notes: '',
  items: [
    {
      name: 'Headlights', status: '', notes: '', item: 'Headlights', photoUrls: [], recommend: [],
  
    },
    {
      name: 'Brake Lights', status: '', notes: '', item: 'Brake Lights', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Turn Signals', status: '', notes: '', item: 'Turn Signals', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Reverse Lights', status: '', notes: '', item: 'Reverse Lights', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Wipers/Washers', status: '', notes: '', item: 'Wipers', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Suspension & Steering',
  status: '',
  notes: '',
  items: [
    {
      name: 'Front Shocks/Struts', status: '', notes: '', item: 'Front Shocks', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Rear Shocks/Struts', status: '', notes: '', item: 'Rear Shocks', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Ball Joints', status: '', notes: '', item: 'Ball Joints', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Tie Rod Ends', status: '', notes: '', item: 'Tie Rods', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Control Arms/Bushings', status: '', notes: '', item: 'Control Arms', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Wheel Bearings', status: '', notes: '', item: 'Bearings', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Other Items',
  status: '',
  notes: '',
  items: [
    {
      name: 'Cabin Air Filter', status: '', notes: '', item: 'Cabin Filter', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Engine Air Filter', status: '', notes: '', item: 'Engine Filter', photoUrls: [], recommend: [],
    },
    {
      name: 'Drive Axles/Boots', status: '', notes: '', item: 'Axles', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Exhaust System', status: '', notes: '', item: 'Exhaust', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Underbody Rust', status: '', notes: '', item: 'Rust', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Fluid Leaks', status: '', notes: '', item: 'Leaks', photoUrls: [], recommend: [],
      
    },
  ]
}
    ]
  });
  return (
    <div className="text-white max-w-3xl mx-auto">
      <PreviousPageButton to="/inspection" />
      <h1 className="text-2xl font-bold text-center mb-4">Maintenance 50-Point Inspection</h1>
      
        <StartListeningButton
          isListening={isListening}
          setIsListening={setIsListening}
/>


      <PauseResumeButton isPaused={isPaused} onPause={pauseSession} onResume={resumeSession} />
      <ProgressTracker
        currentItem={session.currentItemIndex}
        currentSection={session.currentSectionIndex}
        totalSections={session.sections.length}
        totalItems={
          session.sections[session.currentSectionIndex]?.items.length || 0
        }
      />

      <div className="flex justify-center gap-4 my-4">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            value="metric"
            checked={unit === 'metric'}
            onChange={() => setUnit('metric')}
          />
          Metric
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            value="imperial"
            checked={unit === 'imperial'}
            onChange={() => setUnit('imperial')}
          />
          Imperial
        </label>
      </div>

      <div className="bg-zinc-900 p-4 rounded mb-6">
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

      {session.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="bg-zinc-800 p-4 rounded mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xl font-bold text-white">{section.title}</h3>
          </div>

          <div className="flex gap-2">
            {['ok', 'fail', 'na'].map((status) => (
              <button
              key={status}
              onClick={() =>
                updateSection(sectionIndex, {
                  status: status.toLowerCase() as InspectionItemStatus,
                })
              }
              className={`px-3 py-1 rounded ${
              section.status === status.toLowerCase()
              ? 'bg-orange-500 text-white'
              : 'bg-zinc-700 text-gray-300'
            }`}
          >
          {status}
          </button>
            ))}
         </div>

          {section.items.map((item, itemIndex) => (
            <div
              key={itemIndex}
              className="bg-zinc-700 p-3 rounded mb-2 flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <strong>{item.name}</strong>
              </div>

              {item.unit && (
                <input
                  type="text"
                  value={item?.value?.toString() || ''}
                  onChange={(e) =>
                    updateItem(sectionIndex, itemIndex, {
                      value: e.target.value,
                    })
                  }
                  className="bg-zinc-900 p-1 rounded text-white w-24 text-right"
                  placeholder={`(${item.unit})`}
                />
              )}

              <textarea
                placeholder="Notes"
                value={item?.notes || ''}
                onChange={(e) =>
                  updateItem(sectionIndex, itemIndex, {
                    notes: e.target.value,
                  })
                }
                className="bg-zinc-900 text-white p-2 rounded w-full mt-2"
              />

              {item.status === 'fail' && (
                <PhotoUploadButton
                  sectionIndex={sectionIndex}
                  itemIndex={itemIndex}
                  onUpload={(url) =>
                    updateItem(sectionIndex, itemIndex, {
                      photoUrls: [...(item.photoUrls || []), url],
                    })
                  }
                />
              )}

              <div className="flex gap-2 mt-2">
          {['ok', 'fail', 'na'].map((status) => (
            <button
              key={status}
              onClick={() =>
                updateItem(sectionIndex, itemIndex, {
                  status: status as InspectionItemStatus,
                })
              }
              className={`px-3 py-1 rounded ${
                item.status === status
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-600 text-gray-300'
              }`}
            >
              {status.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    ))}

          <textarea
            placeholder="Section Notes"
            value={section?.notes || ''}
            onChange={(e) =>
              updateSection(sectionIndex, { notes: e.target.value })
            }
            className="bg-zinc-900 text-white p-2 rounded w-full mt-2"
          />
        </div>
      ))}

<SmartHighlight
  item={
    session.sections?.[session.currentSectionIndex]?.items?.[session.currentItemIndex]}
    session={session}
  
  onCommand={(cmd) =>
    handleTranscript({
      command: cmd,
      session,
      updateInspection,
      updateItem,
      updateSection,
      finishSession,
    })
  }
  interpreter={(transcript) =>
    handleTranscript({
      command: transcript,
      session,
      updateInspection,
      updateItem,
      updateSection,
      finishSession,
    })
  }
/>
      <div className="mt-6 flex justify-between">
        <button
          className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded text-white font-bold"
          onClick={() => saveInspectionSession(session)}
        >
          Save Progress
        </button>
        <button
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white font-bold"
          onClick={finishSession}
        >
          Finish Inspection
        </button>
      </div>
    </div>
  );
}