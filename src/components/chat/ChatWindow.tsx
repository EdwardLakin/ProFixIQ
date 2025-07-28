'use client';

import { useEffect, useState, useRef } from 'react';
import supabase from '@lib/supabaseClient';
import { Database } from '@/types/supabase';

type Message = Database['public']['Tables']['messages']['Row'];

type ChatWindowProps = {
  conversationId: string;
  userId: string;
};

export default function ChatWindow({ conversationId, userId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchInitialMessages = async () => {
      try {
        const res = await fetch('/api/chat/get-messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId }),
        });
        const data = await res.json();
        setMessages(data);
      } catch (err) {
        console.error('Fetch error:', err);
      }
    };
    fetchInitialMessages();
  }, [conversationId]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    try {
      await fetch('/api/chat/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, senderId: userId, content: newMessage }),
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full border rounded bg-neutral-900 text-white">
      <div className="flex-1 p-4 overflow-y-auto space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-2 rounded ${
              msg.sender_id === userId
                ? 'bg-orange-600 ml-auto text-right'
                : 'bg-gray-700 mr-auto'
            }`}
          >
            <p className="text-sm">{msg.content}</p>
            <p className="text-xs text-gray-400">
              {new Date(msg.sent_at).toLocaleTimeString()}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="p-2 border-t border-gray-700 flex items-center gap-2">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          className="flex-1 rounded bg-neutral-800 border border-neutral-600 px-3 py-2"
        />
        <button
          onClick={handleSend}
          className="bg-orange-500 px-4 py-2 rounded hover:bg-orange-600 font-semibold"
        >
          Send
        </button>
      </div>
    </div>
  );
}