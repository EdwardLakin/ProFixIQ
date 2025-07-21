'use client';

import { useEffect, useState } from 'react';
import { getUserConversations } from '@lib/chat/getUserConversations';
import type { Database } from '@/types/supabase';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import clsx from 'clsx';

type Conversation = Database['public']['Tables']['conversations']['Row'];

interface Props {
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
}

export default function ConversationList({
  activeConversationId,
  setActiveConversationId,
}: Props) {
  const supabase = createClientComponentClient<Database>();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    const fetch = async () => {
      const result = await getUserConversations(supabase);
      setConversations(result);
    };
    fetch();
  }, [supabase]);

  return (
    <div className="w-full">
      <h2 className="text-sm font-bold text-gray-400 px-3 mb-2">Chats</h2>
      {conversations.map((conv) => (
        <div
          key={conv.id}
          className={clsx(
            'px-3 py-2 cursor-pointer',
            conv.id === activeConversationId ? 'bg-gray-200 font-bold' : ''
          )}
          onClick={() => setActiveConversationId(conv.id)}
        >
          {conv.context_type ? `${conv.context_type}: ` : ''}{conv.id.slice(0, 8)}
        </div>
      ))}
    </div>
  );
}