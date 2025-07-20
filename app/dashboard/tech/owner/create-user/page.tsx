// app/dashboard/owner/create-user/page.tsx
'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import type { Database } from '@/types/supabase';

export default function CreateUserPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'mechanic' | 'advisor' | 'manager' | 'admin' | 'owner'>('mechanic');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, role },
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setSuccess(`User created: ${email}. Temporary password provided.`);
    setEmail('');
    setPassword('');
    setFullName('');
    setRole('mechanic');
  };

  return (
    <div className="max-w-lg mx-auto py-8 px-4 text-white font-blackops">
      <h1 className="text-2xl text-orange-500 mb-6">Create New User</h1>

      <form onSubmit={handleCreateUser} className="space-y-4">
        <input
          type="text"
          placeholder="Full Name"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />
        <input
          type="password"
          placeholder="Temporary Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        />

        <select
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
          className="w-full p-2 rounded bg-gray-900 border border-orange-500"
        >
          <option value="mechanic">Technician</option>
          <option value="advisor">Service Advisor</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>

        <button
          type="submit"
          className="w-full bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          Create User
        </button>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">{success}</p>}
      </form>
    </div>
  );
}