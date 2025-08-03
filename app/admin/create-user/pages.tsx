'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { Database } from '@/types/supabase';
import { useRouter } from 'next/navigation';

type Profile = Database['public']['Tables']['profiles']['Row'];

export default function CreateUserPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'manager' | 'advisor' | 'mechanic'>('mechanic');
  const [plan, setPlan] = useState<'free' | 'diy' | 'pro' | 'pro_plus'>('free');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [users, setUsers] = useState<Profile[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    setUsers(data || []);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const { data: user, error: signUpError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (signUpError || !user.user?.id) {
      setError(signUpError?.message || 'Failed to create user.');
      return;
    }

    const { error: profileError } = await supabase.from('profiles').insert({
      id: user.user.id,
      full_name: fullName,
      email,
      role,
      plan,
      phone,
      created_at: new Date().toISOString(),
      shop_id: null,
      business_name: null,
      shop_name: null,
    });

    if (profileError) {
      setError(profileError.message);
    } else {
      setSuccess(`${role} created successfully!`);
      setEmail('');
      setTempPassword('');
      setFullName('');
      setPhone('');
      fetchUsers();
    }
  };

  const handleDelete = async (userId: string) => {
    await supabase.from('profiles').delete().eq('id', userId);
    await supabase.auth.admin.deleteUser(userId);
    fetchUsers();
  };

  return (
    <div className="p-8 max-w-3xl mx-auto text-white font-blackops">
      <h1 className="text-3xl text-orange-500 mb-6">Create User</h1>

      <form onSubmit={handleCreateUser} className="space-y-4 mb-10">
        <input
          type="text"
          placeholder="Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <input
          type="text"
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <input
          type="email"
          required
          placeholder="Email"
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
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as typeof role)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        >
          <option value="mechanic">Mechanic</option>
          <option value="advisor">Advisor</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>

        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value as typeof plan)}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        >
          <option value="free">Free</option>
          <option value="diy">DIY</option>
          <option value="pro">Pro</option>
          <option value="pro_plus">Pro Plus</option>
        </select>

        <div className="flex gap-4">
          <button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
          >
            Create User
          </button>
          <button
            onClick={() => router.push('/dashboard/admin')}
            className="text-orange-400 underline"
          >
            ← Back to Dashboard
          </button>
        </div>

        {error && <p className="text-red-500">{error}</p>}
        {success && <p className="text-green-500">{success}</p>}
      </form>

      <h2 className="text-xl text-orange-400 mb-4">Existing Users</h2>
      <ul className="space-y-2">
        {users.map((user) => (
          <li
            key={user.id}
            className="flex justify-between items-center bg-neutral-800 p-3 rounded"
          >
            <div>
              <p className="font-bold">
                {user.full_name || '—'} ({user.role})
              </p>
              <p className="text-sm text-gray-400">{user.email}</p>
              <p className="text-sm text-gray-500">{user.phone || '—'}</p>
            </div>
            <button
              onClick={() => handleDelete(user.id)}
              className="text-red-400 hover:text-red-300 text-sm"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}