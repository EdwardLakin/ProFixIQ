// layout.tsx
'use client';

import { useState } from 'react';
import ChatWindow from '@components/chat/ChatWindow';
import ConversationList from '@components/chat/ConversationList';
import { useUser } from '@hooks/useUser';

export default function ChatLayout() {
  const { user } = useUser();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);

  return (
    <div className="h-[calc(100vh-4rem)] flex">
      <div className="w-80 border-r border-gray-800 bg-neutral-900">
        <ConversationList
          activeConversationId={activeConversationId ?? ''}
          setActiveConversationId={setActiveConversationId}
        />
      </div>
      <div className="flex-1 bg-neutral-950">
        {activeConversationId ? (
          <ChatWindow
            conversationId={activeConversationId}
            userId={user?.id ?? ''}
          />
        ) : (
          <div className="w-full flex items-center justify-center text-gray-500">
            Select a conversation to begin
          </div>
        )}
      </div>
    </div>
  );
}