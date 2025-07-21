'use client';

import { Dialog } from '@headlessui/react';
import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  created_by: string;
  context_type?: string;
  context_id?: string;
}

export default function NewChatModal({
  isOpen,
  onClose,
  onCreated,
  created_by,
  context_type,
  context_id,
}: Props) {
  const supabase = createClientComponentClient<Database>();
  const [users, setUsers] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  useEffect(() => {
  const fetch = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role');

    if (data) setUsers(data as Profile[]);
  };
  fetch();
}, []);

  const toggleUser = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleCreate = async () => {
    const conversationId = uuidv4();

    const participants = new Set<string>(selectedIds);
    users.forEach((user) => {
      if (user.role && selectedRoles.includes(user.role)) {
        participants.add(user.id);
      }
    });

    if (participants.size < 2) {
      toast.error('Select at least 1 other participant');
      return;
    }

    const { error: convError } = await supabase.from('conversations').insert({
      id: conversationId,
      created_by,
      context_type,
      context_id,
    });

    if (convError) {
      toast.error('Failed to create conversation');
      return;
    }

    const inserts = Array.from(participants).map((id) => ({
      id: uuidv4(),
      conversation_id: conversationId,
      user_id: id,
    }));

    await supabase.from('conversation_participants').insert(inserts);
    toast.success('Chat created');
    onCreated(conversationId);
    onClose();
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="z-50 fixed inset-0 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" />
      <Dialog.Panel className="bg-white dark:bg-neutral-900 text-black dark:text-white p-6 rounded max-w-lg w-full space-y-4">
        <Dialog.Title className="text-lg font-semibold">Start New Chat</Dialog.Title>

        <div>
          <label className="block font-medium text-sm mb-1">Select Users:</label>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {users.map((user) => (
              <label key={user.id} className="block">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(user.id)}
                  onChange={() => toggleUser(user.id)}
                />{' '}
                {user.full_name} ({user.role})
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block font-medium text-sm mb-1">Add Role Groups:</label>
          <div className="flex flex-wrap gap-2">
            {['tech', 'advisor', 'parts', 'foreman', 'lead_hand'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className={`px-2 py-1 rounded text-sm border ${
                  selectedRoles.includes(role)
                    ? 'bg-orange-500 text-white'
                    : 'bg-neutral-700 text-gray-200'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded bg-neutral-700 hover:bg-neutral-600"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded bg-orange-500 hover:bg-orange-600 text-white font-semibold"
          >
            Create Chat
          </button>
        </div>
      </Dialog.Panel>
    </Dialog>
  );
}