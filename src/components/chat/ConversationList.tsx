import { useEffect, useState } from 'react';
import { getUserConversations } from '@lib/chat/getUserConversations';
import type { Database } from '@/types/supabase';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import clsx from 'clsx';

type Conversation = Database['public']['Tables']['conversations']['Row'];
type Message = Database['public']['Tables']['messages']['Row'];

interface ConversationWithMeta extends Conversation {
  latest_message?: Message | null;
  unread_count: number;
}

interface Props {
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
}

export default function ConversationList({
  activeConversationId,
  setActiveConversationId,
}: Props) {
  const supabase = createClientComponentClient<Database>();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);

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
            'px-3 py-2 cursor-pointer rounded',
            conv.id === activeConversationId ? 'bg-gray-200 font-bold' : 'hover:bg-neutral-800'
          )}
          onClick={() => setActiveConversationId(conv.id)}
        >
          <div className="flex justify-between items-center">
            <div className="text-sm">
              {conv.context_type ? `${conv.context_type}: ` : ''}{conv.id.slice(0, 8)}
              <div className="text-xs text-gray-400 truncate max-w-[180px]">
                {conv.latest_message?.content || 'No messages yet'}
              </div>
            </div>
            {conv.unread_count > 0 && (
              <span className="ml-2 bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {conv.unread_count}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}