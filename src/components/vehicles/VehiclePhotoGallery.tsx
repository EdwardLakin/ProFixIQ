'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Image from 'next/image';
import { Dialog } from '@headlessui/react';
import { PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { Database } from '@/types/supabase';

type VehiclePhoto = Database['public']['Tables']['vehicle_photos']['Row'];

interface Props {
  vehicleId: string;
  currentUserId: string;
}

export default function VehiclePhotoGallery({ vehicleId, currentUserId }: Props) {
  const supabase = createClientComponentClient<Database>();
  const [photos, setPhotos] = useState<VehiclePhoto[]>([]);
  const [editingCaptionId, setEditingCaptionId] = useState<string | null>(null);
  const [editedCaption, setEditedCaption] = useState('');
  const [fullscreenPhoto, setFullscreenPhoto] = useState<VehiclePhoto | null>(null);

  useEffect(() => {
    const fetchPhotos = async () => {
      const { data, error } = await supabase
        .from('vehicle_photos')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false });
      if (data) setPhotos(data);
    };

    fetchPhotos();
  }, [vehicleId]);

  const handleDelete = async (id: string) => {
    await supabase.from('vehicle_photos').delete().eq('id', id);
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCaptionSave = async (id: string) => {
    await supabase.from('vehicle_photos').update({ caption: editedCaption }).eq('id', id);
    setPhotos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, caption: editedCaption } : p))
    );
    setEditingCaptionId(null);
    setEditedCaption('');
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mt-4">
      {photos.map((photo) => (
        <div key={photo.id} className="relative group">
          <Image
            src={photo.url}
            alt="Vehicle Photo"
            width={300}
            height={200}
            className="rounded shadow cursor-pointer"
            onClick={() => setFullscreenPhoto(photo)}
          />

          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
            {photo.uploaded_by === currentUserId && (
              <>
                <button onClick={() => {
                  setEditingCaptionId(photo.id);
                  setEditedCaption(photo.caption || '');
                }}>
                  <PencilIcon className="w-5 h-5 text-orange-400 hover:text-orange-600" />
                </button>
                <button onClick={() => handleDelete(photo.id)}>
                  <TrashIcon className="w-5 h-5 text-red-400 hover:text-red-600" />
                </button>
              </>
            )}
          </div>

          <div className="mt-1 text-sm text-gray-300">
            {editingCaptionId === photo.id ? (
              <div className="flex gap-2 items-center">
                <input
                  value={editedCaption}
                  onChange={(e) => setEditedCaption(e.target.value)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm w-full"
                />
                <button
                  onClick={() => handleCaptionSave(photo.id)}
                  className="text-green-500 text-sm"
                >
                  Save
                </button>
              </div>
            ) : (
              photo.caption
            )}
          </div>
        </div>
      ))}

      <Dialog open={!!fullscreenPhoto} onClose={() => setFullscreenPhoto(null)} className="relative z-50">
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4">
          <Dialog.Panel className="relative">
            <Image
              src={fullscreenPhoto?.url || ''}
              alt="Full Size Vehicle"
              width={1000}
              height={700}
              className="rounded shadow-lg max-h-[90vh] object-contain"
            />
            {fullscreenPhoto?.caption && (
              <p className="text-white text-center mt-4">{fullscreenPhoto.caption}</p>
            )}
            <button
              className="absolute top-4 right-4 text-white hover:text-red-400"
              onClick={() => setFullscreenPhoto(null)}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </Dialog.Panel>
        </div>
      </Dialog>
    </div>
  );
}