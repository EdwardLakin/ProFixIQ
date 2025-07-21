'use client';

import { useState } from 'react';
import ConversationList from '@components/chat/ConversationList';
import ChatWindow from '@components/chat/ChatWindow';
import { Database } from '@/types/supabase';

export default function ChatLayout({ userId }: { userId: string }) {
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-800 bg-neutral-900">
        <ConversationList
          activeConversationId={activeConversationId ?? ''}
          setActiveConversationId={setActiveConversationId}
        />
      </div>

      {/* Main chat window */}
      <div className="flex-1 bg-neutral-950">
        {activeConversationId ? (
          <ChatWindow conversationId={activeConversationId} userId={userId} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Select a conversation to begin
          </div>
        )}
      </div>
    </div>
  );
}