'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import type { Database } from '@/types/supabase';

export default function CreateTechPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleCreateTech = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const { data: user, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (signUpError || !user.user?.id) {
      setError(signUpError?.message || 'Failed to create tech.');
      return;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: user.user.id,
        email,
        role: 'mechanic',
      });

    if (profileError) {
      setError(profileError.message);
    } else {
      setSuccess('Technician created successfully!');
      setEmail('');
      setTempPassword('');
    }
  };

  return (
    <div className="p-8 max-w-lg mx-auto text-white font-blackops">
      <h1 className="text-3xl text-orange-500 mb-6">Create Technician</h1>
      <form onSubmit={handleCreateTech} className="space-y-4">
        <input
          type="email"
          required
          placeholder="Technician Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <input
          type="text"
          required
          placeholder="Temporary Password"
          value={tempPassword}
          onChange={(e) => setTempPassword(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <button
          type="submit"
          className="bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          Create Tech
        </button>
        {error && <p className="text-red-500">{error}</p>}
        {success && <p className="text-green-500">{success}</p>}
      </form>
    </div>
  );
}