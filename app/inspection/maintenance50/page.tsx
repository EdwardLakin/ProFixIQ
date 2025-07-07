  'use client';

import PauseResumeButton from '@lib/inspection/PauseResume';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import ProgressTracker from '@lib/inspection/ProgressTracker';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import { saveInspectionSession } from '@lib/inspection/save';
import interpretCommand from '@components/inspection/interpretCommand';
import handleTranscript from '@lib/inspection/handleTranscript';
import { InspectionItemStatus, InspectionStatus } from '@lib/inspection/types';

import PreviousPageButton from '@components/ui/PreviousPageButton';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';

export default function Maintenance50InspectionPage() {
  const searchParams = useSearchParams();
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric');
  const [isListening, setIsListening] = useState(false);

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

  const initialSession = useMemo(() => ({
    templateName: 'Maintenance 50-Point Inspection',
  status: 'not_started' as InspectionStatus,
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
    status: '' as InspectionItemStatus,
    notes: '',
    items: [
      {
        name: 'Front Left Tire Pressure', status: '' as InspectionItemStatus, unit: 'psi', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Front Right Tire Pressure', status: '' as InspectionItemStatus, unit: 'psi', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Front Left Rotor', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Front Right Rotor', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
        
      },
      {
        name: 'Front Left Pad', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
        
      },
      {
        name: 'Front Right Pad', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Front Left Push Rod Travel', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Front Right Push Rod Travel', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
    
      },
    ]
  },
  {
    title: 'Axle 2',
    status: '' as InspectionItemStatus,
    notes: '',
    items: [
      {
        name: 'Rear Left Tire Pressure', status: '' as InspectionItemStatus, unit: 'psi', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
  
      },
      {
        name: 'Rear Right Tire Pressure', status: '' as InspectionItemStatus, unit: 'psi', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Left Rotor', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Right Rotor', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Left Pad', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Right Pad', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Rear Left Push Rod Travel', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Rear Right Push Rod Travel', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
        
      },
    ]
  },
  {
    title: 'Park Brake & Torque',
    status: '' as InspectionItemStatus,
    notes: '',
    items: [
      {
        name: 'Park Brake Lining Left', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'Left', photoUrls: [], recommend: [],
    
      },
      {
        name: 'Park Brake Lining Right', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'Right', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Park Brake Lining Trans', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'Trans', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Wheel Torque Inner', status: '' as InspectionItemStatus, unit: 'ft lbs', value: '', notes: '', item: 'Inner', photoUrls: [], recommend: [],
      
      },
      {
        name: 'Wheel Torque Outer', status: '' as InspectionItemStatus, unit: 'ft lbs', value: '', notes: '', item: 'Outer', photoUrls: [], recommend: [],
      
      },
    ]
  },
  {
  title: 'Fluids',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'Engine Oil', status: '' as InspectionItemStatus, unit: 'L', value: '', notes: '', item: 'Engine Oil', photoUrls: [], recommend: [],

    },
    {
      name: 'Coolant', status: '' as InspectionItemStatus, unit: 'L', value: '', notes: '', item: 'Coolant', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Transmission Fluid', status: '' as InspectionItemStatus, unit: 'L', value: '', notes: '', item: 'Transmission', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Power Steering Fluid', status: '' as InspectionItemStatus, unit: 'L', value: '', notes: '', item: 'Steering', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Windshield Washer Fluid', status: '' as InspectionItemStatus, unit: 'L', value: '', notes: '', item: 'Washer', photoUrls: [], recommend: [],

    },
  ]
},
{
  title: 'Belts & Hoses',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'Serpentine Belt', status: '' as InspectionItemStatus, notes: '', item: 'Serpentine', photoUrls: [], recommend: [],
  
    },
    {
      name: 'Timing Belt/Chain', status: '' as InspectionItemStatus, notes: '', item: 'Timing', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Coolant Hoses', status: '' as InspectionItemStatus, notes: '', item: 'Coolant Hoses', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Vacuum Hoses', status: '' as InspectionItemStatus, notes: '', item: 'Vacuum', photoUrls: [], recommend: [],
    
    },
  ]
},
{
  title: 'Battery & Charging',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'Battery Condition', status: '' as InspectionItemStatus, notes: '', item: 'Battery', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Charging System Output', status: '' as InspectionItemStatus, unit: 'V', value: '', notes: '', item: 'Charging', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Battery Terminals & Cables', status: '' as InspectionItemStatus, notes: '', item: 'Terminals', photoUrls: [], recommend: [],
    
    },
  ]
},
{
  title: 'Brakes',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'Front Brake Pads', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'Front Pads', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Front Rotors', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'Front Rotors', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Rear Brake Pads', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'Rear Pads', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Rear Rotors', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'Rear Rotors', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Brake Lines', status: '' as InspectionItemStatus, notes: '', item: 'Brake Lines', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Tires',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'LF Tread Depth', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LF', photoUrls: [], recommend: [],
    
    },
    {
      name: 'LR Tread Depth', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'LR', photoUrls: [], recommend: [],
      
    },
    {
      name: 'RF Tread Depth', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RF', photoUrls: [], recommend: [],
      
    },
    {
      name: 'RR Tread Depth', status: '' as InspectionItemStatus, unit: 'mm', value: '', notes: '', item: 'RR', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Lights & Electronics',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'Headlights', status: '' as InspectionItemStatus, notes: '', item: 'Headlights', photoUrls: [], recommend: [],
  
    },
    {
      name: 'Brake Lights', status: '' as InspectionItemStatus, notes: '', item: 'Brake Lights', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Turn Signals', status: '' as InspectionItemStatus, notes: '', item: 'Turn Signals', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Reverse Lights', status: '' as InspectionItemStatus, notes: '', item: 'Reverse Lights', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Wipers/Washers', status: '' as InspectionItemStatus, notes: '', item: 'Wipers', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Suspension & Steering',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'Front Shocks/Struts', status: '' as InspectionItemStatus, notes: '', item: 'Front Shocks', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Rear Shocks/Struts', status: '' as InspectionItemStatus, notes: '', item: 'Rear Shocks', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Ball Joints', status: '' as InspectionItemStatus, notes: '', item: 'Ball Joints', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Tie Rod Ends', status: '' as InspectionItemStatus, notes: '', item: 'Tie Rods', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Control Arms/Bushings', status: '' as InspectionItemStatus, notes: '', item: 'Control Arms', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Wheel Bearings', status: '' as InspectionItemStatus, notes: '', item: 'Bearings', photoUrls: [], recommend: [],
      
    },
  ]
},
{
  title: 'Other Items',
  status: '' as InspectionItemStatus,
  notes: '',
  items: [
    {
      name: 'Cabin Air Filter', status: '' as InspectionItemStatus, notes: '', item: 'Cabin Filter', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Engine Air Filter', status: '' as InspectionItemStatus, notes: '', item: 'Engine Filter', photoUrls: [], recommend: [],
    },
    {
      name: 'Drive Axles/Boots', status: '' as InspectionItemStatus, notes: '', item: 'Axles', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Exhaust System', status: '' as InspectionItemStatus, notes: '', item: 'Exhaust', photoUrls: [], recommend: [],
      
    },
    {
      name: 'Underbody Rust', status: '' as InspectionItemStatus, notes: '', item: 'Rust', photoUrls: [], recommend: [],
    
    },
    {
      name: 'Fluid Leaks', status: '' as InspectionItemStatus, notes: '', item: 'Leaks', photoUrls: [], recommend: [],
      
    },
  ]
}
    ]
  }), [searchParams]);

  const {
    session,
    updateInspection,
    updateItem,
    startSession,
    finishSession,
    isPaused,
    resumeSession,
    pauseSession,
    addQuoteLine,
  } = useInspectionSession(initialSession);

  return (
    <div className="text-white max-w-3xl mx-auto">
      <PreviousPageButton to="/inspection" />
      <h1 className="text-2xl font-bold text-center mb-4">Maintenance 50-Point Inspection</h1>

      <StartListeningButton
        isListening={isListening}
        setIsListening={setIsListening}
      />

      <PauseResumeButton
        isPaused={isPaused}
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

      {session.sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="bg-zinc-800 p-4 rounded mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xl font-bold text-white">{section.title}</h3>
            <div className="flex gap-2">
              {['ok', 'fail', 'na'].map((status) => (
                <button
                  key={status}
                  onClick={() =>                  
                   updateInspection(sectionIndex, {
                    status: status.toLowerCase() as InspectionStatus
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
                  value={item.value?.toString() || ''}
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
                value={item.notes || ''}
                onChange={(e) =>
                  updateItem(sectionIndex, itemIndex, {
                    notes: e.target.value,
                  })
                }
                className="bg-zinc-900 text-white p-2 rounded w-full mt-2"              />

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
                        : 'bg-zinc-800 text-gray-300'
                    }`}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}