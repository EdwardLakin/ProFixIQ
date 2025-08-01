'use client';

import { useState } from 'react';
import { parseWorkOrderCommand } from '@lib/work-orders/commandProcessor';
import { handleWorkOrderCommand } from '@lib/work-orders/handleWorkOrderCommand';
import { createBrowserClient } from '@supabase/ssr';
import { useUser } from '@hooks/useUser';
import type { Database } from '@/types/supabase';

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BookingPage() {
  const { user } = useUser();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string | null>(null);

  const runCommand = async () => {
    const parsed = parseWorkOrderCommand(input);

    if (!parsed) {
      setOutput('Unrecognized command.');
      return;
    }

    if (!user) {
      setOutput('User not authenticated.');
      return;
    }

    const result = await handleWorkOrderCommand(parsed, supabase, user);
    setOutput(result);
  };

  return (
    <div className="p-6 space-y-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold">Test Work Order Commands</h1>
      <input
        className="border px-4 py-2 w-full"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="e.g. start job 123"
      />
      <button
        onClick={runCommand}
        className="bg-orange-600 text-white px-4 py-2 rounded"
      >
        Run
      </button>
      {output && (
        <div className="mt-4 p-4 bg-gray-100 border rounded">
          <strong>Result:</strong> {output}
        </div>
      )}
    </div>
  );
}