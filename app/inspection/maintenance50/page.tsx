'use client';

import React, { useEffect, useRef } from 'react';
import useInspectionSession from '@lib/inspection/useInspectionSession';
import maintenanceInspectionTemplate  from '@lib/inspection/templates/maintenance50Point';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import SectionHeader from '@components/inspection/SectionHeader';
import SmartHighlight from '@lib/inspection/SmartHighlight';
import StatusButtons from '@lib/inspection/StatusButtons';
import StartListeningButton from '@lib/inspection/StartListeningButton';
import PauseResumeButton from '@lib/inspection/PauseResume';
import ProgressTracker from '@lib/inspection/ProgressTracker';
import { saveInspectionSession } from '@lib/inspection/save';
import PhotoUploadButton from '@lib/inspection/PhotoUploadButton';

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
    startSession(maintenanceInspectionTemplate);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [session.currentItemIndex, session.currentSectionIndex]);

  const section = session.sections[session.currentSectionIndex];
  const totalSections = session.sections.length;

  const handleFinish = async () => {
    await saveInspectionSession(session);
    // Redirect to review or summary screen later
  };

  return (
    <div className="min-h-screen px-4 pb-20 pt-4 text-white max-w-3xl mx-auto">
      <PreviousPageButton to="/inspection" />
      <h1 className="text-2xl text-center font-bold mb-2">Maintenance 50-Point Inspection</h1>

      <div className="bg-black bg-opacity-20 p-4 mb-4 rounded-lg">
        <h2 className="text-md font-bold mb-2">Customer Info</h2>
        <p>{session.customer.first_name} {session.customer.last_name}</p>
        <p>{session.customer.phone}, {session.customer.email}</p>
        <p>{session.customer.address}, {session.customer.city}, {session.customer.province} {session.customer.postal_code}</p>
      </div>

      <div className="bg-black bg-opacity-20 p-4 mb-4 rounded-lg">
        <h2 className="text-md font-bold mb-2">Vehicle Info</h2>
        <p>{session.vehicle.year} {session.vehicle.make} {session.vehicle.model}</p>
        <p>VIN: {session.vehicle.vin}</p>
        <p>License Plate: {session.vehicle.license_plate}</p>
        <p>Mileage: {session.vehicle.mileage}</p>
        <p>Color: {session.vehicle.color}</p>
      </div>

      <div className="flex justify-between items-center mb-2">
        <PauseResumeButton isPaused={session.isPaused} onPause={pauseSession} onResume={resumeSession} />
        <ProgressTracker
          currentSection={session.currentSectionIndex}
          currentItem={session.currentItemIndex}
          totalSections={totalSections}
          totalItems={section.items.length}
        />
        <StartListeningButton />
      </div>

      <SectionHeader
        title={section.title}
        section={session.currentSectionIndex}
      />

      {section.items.map((item, itemIndex) => (
        <div
          key={itemIndex}
          ref={itemIndex === session.currentItemIndex ? scrollRef : null}
          className="mb-6 border border-gray-700 rounded-lg p-4 bg-black bg-opacity-20"
        >
          <SmartHighlight item={item} />
          <StatusButtons
            item={item}
            sectionIndex={session.currentSectionIndex}
            itemIndex={itemIndex}
            updateItem={updateItem}
          />
          <PhotoUploadButton
            sectionIndex={session.currentSectionIndex}
            itemIndex={itemIndex}
            onUpload={(photoUrl: string) =>
              updateItem(session.currentSectionIndex, itemIndex, {
                photoUrls: [...(item.photoUrls || []), photoUrl],
              })
            }
          />
          <div className="mt-2">
            <textarea
              value={item.notes || ''}
              onChange={(e) =>
                updateItem(session.currentSectionIndex, itemIndex, {
                  notes: e.target.value,
                })
              }
              className="w-full p-2 rounded-md text-black"
              placeholder="Enter notes..."
            />
          </div>
        </div>
      ))}

      <div className="flex justify-between mt-8 space-x-4">
        <button
          className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded"
          onClick={handleFinish}
        >
          Finish Inspection
        </button>

        <button
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
          onClick={() => saveInspectionSession(session)}
        >
          Save Inspection
        </button>
      </div>
    </div>
  );
}