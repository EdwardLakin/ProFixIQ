'use client';

import React, { useEffect, useRef } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import SectionHeader from '@components/inspection/SectionHeader';
import StatusButtons from '@lib/inspection/StatusButtons';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import PauseResumeButton from '@lib/inspection/PauseResume';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';
import ProgressTracker from '@lib/inspection/ProgressTracker';
import Legend from '@lib/inspection/Legend';
import { SaveInspectionButton } from '@components/inspection/SaveInspectionButton';
import FinishInspectionButton from '@components/inspection/FinishInspectionButton';
import maintenanceTemplate from '@lib/inspection/templates/maintenance50Point';

export default function Maintenance50InspectionPage() {
  const {
    session,
    startSession,
    pauseSession,
    resumeSession,
    updateItem,
    updateInspection,
  } = useInspectionSession();

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startSession(maintenanceTemplate);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [session.currentItemIndex, session.currentSectionIndex]);

  const section = session.sections[session.currentSectionIndex];
  const item = section?.items[session.currentItemIndex];

  return (
    <div className="min-h-screen px-4 pb-20 pt-4 text-white max-w-3xl mx-auto">
      <PreviousPageButton to ="/inspection" />
      <h1 className="text-2xl text-center font-black mb-4">Maintenance 50-Point Inspection</h1>

      {/* Vehicle + Customer Info */}
      <div className="bg-black bg-opacity-20 rounded-xl p-4 mb-6">
        <h2 className="text-lg font-bold text-orange-400 mb-2">Customer Info</h2>
        <p>{session.customer?.first_name} {session.customer?.last_name}</p>
        <p>{session.customer?.phone} • {session.customer?.email}</p>
        <p>{session.customer?.address}, {session.customer?.city}, {session.customer?.province} {session.customer?.postal_code}</p>
        <h2 className="text-lg font-bold text-orange-400 mt-4 mb-2">Vehicle Info</h2>
        <p>{session.vehicle?.year} {session.vehicle?.make} {session.vehicle?.model}</p>
        <p>VIN: {session.vehicle?.vin} • Plate: {session.vehicle?.license_plate}</p>
        <p>Mileage: {session.vehicle?.mileage} • Color: {session.vehicle?.color}</p>
      </div>

      <div className="bg-black bg-opacity-20 rounded-xl p-4 mb-6">
  <h2 className="text-lg font-bold text-orange-400 mb-2">Customer Info</h2>
  <div className="grid grid-cols-2 gap-3">
    <input className="input" placeholder="First Name" value={session.customer?.first_name || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, first_name: e.target.value } })} />
    <input className="input" placeholder="Last Name" value={session.customer?.last_name || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, last_name: e.target.value } })} />
    <input className="input col-span-2" placeholder="Phone" value={session.customer?.phone || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, phone: e.target.value } })} />
    <input className="input col-span-2" placeholder="Email" value={session.customer?.email || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, email: e.target.value } })} />
    <input className="input col-span-2" placeholder="Address" value={session.customer?.address || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, address: e.target.value } })} />
    <input className="input" placeholder="City" value={session.customer?.city || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, city: e.target.value } })} />
    <input className="input" placeholder="Province" value={session.customer?.province || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, province: e.target.value } })} />
    <input className="input col-span-2" placeholder="Postal Code" value={session.customer?.postal_code || ''} 
      onChange={(e) => updateInspection({ customer: { ...session.customer, postal_code: e.target.value } })} />
  </div>

  <h2 className="text-lg font-bold text-orange-400 mt-6 mb-2">Vehicle Info</h2>
  <div className="grid grid-cols-2 gap-3">
    <input className="input" placeholder="Year" value={session.vehicle?.year || ''} 
      onChange={(e) => updateInspection({ vehicle: { ...session.vehicle, year: e.target.value } })} />
    <input className="input" placeholder="Make" value={session.vehicle?.make || ''} 
      onChange={(e) => updateInspection({ vehicle: { ...session.vehicle, make: e.target.value } })} />
    <input className="input col-span-2" placeholder="Model" value={session.vehicle?.model || ''} 
      onChange={(e) => updateInspection({ vehicle: { ...session.vehicle, model: e.target.value } })} />
    <input className="input col-span-2" placeholder="VIN" value={session.vehicle?.vin || ''} 
      onChange={(e) => updateInspection({ vehicle: { ...session.vehicle, vin: e.target.value } })} />
    <input className="input col-span-2" placeholder="License Plate" value={session.vehicle?.license_plate || ''} 
      onChange={(e) => updateInspection({ vehicle: { ...session.vehicle, license_plate: e.target.value } })} />
    <input className="input" placeholder="Mileage" value={session.vehicle?.mileage || ''} 
      onChange={(e) => updateInspection({ vehicle: { ...session.vehicle, mileage: e.target.value } })} />
    <input className="input" placeholder="Color" value={session.vehicle?.color || ''} 
      onChange={(e) => updateInspection({ vehicle: { ...session.vehicle, color: e.target.value } })} />
  </div>
</div>

      {/* Inspection Controls */}
      <div className="flex justify-between items-center mb-4">
        <StartListeningButton />
        <PauseResumeButton
          isPaused={session.isPaused}
          onPause={pauseSession}
          onResume={resumeSession}
        />
      </div>
      <Legend />
      <ProgressTracker
        currentItem={session.currentItemIndex}
        currentSection={session.currentSectionIndex}
        totalSections={session.sections.length}
        totalItems={session.sections[session.currentSectionIndex]?.items.length || 0}
      />
      <SectionHeader
  title={session.sections[session.currentSectionIndex]?.title || 'Section'}
  section={session.currentSectionIndex}
/>
      
      <div ref={scrollRef} className="p-4 mb-6 rounded-xl bg-black bg-opacity-20 border border-gray-700 shadow-md">
        <h3 className="font-bold text-lg mb-1">{item?.name}</h3>
        <SmartHighlight itemName={item?.name || ''} transcript={session.transcript} />

        <StatusButtons
          item={item}
          sectionIndex={session.currentSectionIndex}
          itemIndex={session.currentItemIndex}
          onStatusChange={(status) =>
            updateItem(session.currentSectionIndex, session.currentItemIndex, { status })
          }
        />

        {['fail', 'recommend'].includes(item?.status || '') && (
          <PhotoUploadButton
            sectionIndex={session.currentSectionIndex}
            itemIndex={session.currentItemIndex}
            onUpload={(photoUrl) => {
              const currentPhotos = item?.photoUrls || [];
              updateItem(session.currentSectionIndex, session.currentItemIndex, {
                photoUrls: [...currentPhotos, photoUrl],
              });
            }}
          />
        )}

        <textarea
          className="w-full mt-3 p-2 bg-black bg-opacity-30 border border-gray-700 rounded-md text-white"
          rows={2}
          placeholder="Notes"
          value={item?.notes || ''}
          onChange={(e) =>
            updateItem(session.currentSectionIndex, session.currentItemIndex, {
              notes: e.target.value,
            })
          }
        />
      </div>

      <div className="flex justify-between gap-4">
        <SaveInspectionButton />
        <FinishInspectionButton />
      </div>
    </div>
  );
}