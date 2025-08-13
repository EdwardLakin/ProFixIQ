"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import Link from "next/link";

type Role = "owner" | "admin" | "manager" | "advisor" | "mechanic";
type Plan = "free" | "diy" | "pro" | "pro_plus";
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export default function CreateUserPage() {
  const supabase = createClientComponentClient<Database>();

  const [data, setData] = useState({
    full_name: "",
    email: "",
    phone: "",
    tempPassword: "",
    role: "mechanic" as Role,
    plan: "free" as Plan,
  });

  const [users, setUsers] = useState<Profile[]>([]);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<{
    full_name: string;
    email: string;
    role: Role;
  } | null>(null);
  const [filterRole, setFilterRole] = useState<Role | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Pagination
  const USERS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);

  const fetchUsers = async () => {
    const { data, error } = await supabase.from("profiles").select("*");
    if (!error) setUsers(data || []);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const { data: user, error: signUpError } =
      await supabase.auth.admin.createUser({
        email: data.email,
        password: data.tempPassword,
        email_confirm: true,
      });

    if (signUpError || !user.user?.id) {
      setError(signUpError?.message || "Failed to create user.");
      return;
    }

    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.user.id,
      full_name: data.full_name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      plan: data.plan,
      created_at: new Date().toISOString(),
      shop_id: null,
      business_name: null,
      shop_name: null,
    });

    if (profileError) {
      setError(profileError.message);
    } else {
      setSuccess(`${data.role} user created successfully!`);
      setData({
        full_name: "",
        email: "",
        phone: "",
        tempPassword: "",
        role: "mechanic",
        plan: "free",
      });
      fetchUsers();
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editFields) return;
    const { error } = await supabase
      .from("profiles")
      .update(editFields)
      .eq("id", id);
    if (!error) {
      setEditingUserId(null);
      setEditFields(null);
      fetchUsers();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (!error) fetchUsers();
  };

  const filteredUsers = users.filter(
    (user) =>
      (filterRole === "all" || user.role === filterRole) &&
      (user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase())),
  );

  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * USERS_PER_PAGE,
    currentPage * USERS_PER_PAGE,
  );

  return (
    <div className="p-6 max-w-4xl mx-auto text-white font-blackops">
      <div className="mb-4">
        <Link
          href="/dashboard/owner"
          className="text-orange-500 hover:underline"
        >
          ← Back to Dashboard
        </Link>
      </div>

      <h1 className="text-3xl text-orange-500 mb-4">Create User</h1>

      <form onSubmit={handleCreateUser} className="space-y-3 mb-8">
        <input
          type="text"
          placeholder="Full Name"
          value={data.full_name}
          onChange={(e) => setData({ ...data, full_name: e.target.value })}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <input
          type="text"
          placeholder="Phone"
          value={data.phone}
          onChange={(e) => setData({ ...data, phone: e.target.value })}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <input
          type="email"
          required
          placeholder="User Email"
          value={data.email}
          onChange={(e) => setData({ ...data, email: e.target.value })}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <input
          type="text"
          required
          placeholder="Temporary Password"
          value={data.tempPassword}
          onChange={(e) => setData({ ...data, tempPassword: e.target.value })}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        />
        <select
          value={data.role}
          onChange={(e) => setData({ ...data, role: e.target.value as Role })}
          className="w-full p-2 rounded bg-gray-800 border border-orange-500"
        >
          <option value="mechanic">Mechanic</option>
          <option value="advisor">Advisor</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>

        <button
          type="submit"
          className="bg-orange-500 hover:bg-orange-600 text-black font-bold py-2 px-4 rounded"
        >
          Create User
        </button>

        {error && <p className="text-red-500">{error}</p>}
        {success && <p className="text-green-500">{success}</p>}
      </form>

      <div className="flex justify-between items-center mb-4">
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as Role | "all")}
          className="p-2 bg-gray-900 border border-orange-500 rounded text-white"
        >
          <option value="all">All Roles</option>
          <option value="mechanic">Mechanic</option>
          <option value="advisor">Advisor</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
        <input
          type="text"
          placeholder="Search users..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="ml-2 p-2 rounded bg-gray-900 border border-orange-500"
        />
      </div>

      {filteredUsers.length === 0 ? (
        <p className="text-gray-400">No users match your filters.</p>
      ) : (
        <>
          <div className="space-y-2">
            {paginatedUsers.map((user) => (
              <div
                key={user.id}
                className="flex flex-col md:flex-row md:items-center justify-between bg-gray-800 p-4 rounded border border-orange-700"
              >
                {editingUserId === user.id ? (
                  <div className="flex flex-col md:flex-row gap-2 w-full md:items-center">
                    <input
                      type="text"
                      value={editFields?.full_name || ""}
                      onChange={(e) =>
                        setEditFields({
                          ...editFields!,
                          full_name: e.target.value,
                        })
                      }
                      className="p-2 rounded bg-gray-900 border border-orange-500 w-full md:w-48"
                    />
                    <input
                      type="text"
                      value={editFields?.email || ""}
                      onChange={(e) =>
                        setEditFields({ ...editFields!, email: e.target.value })
                      }
                      className="p-2 rounded bg-gray-900 border border-orange-500 w-full md:w-64"
                    />
                    <select
                      value={editFields?.role || ""}
                      onChange={(e) =>
                        setEditFields({
                          ...editFields!,
                          role: e.target.value as Role,
                        })
                      }
                      className="p-2 bg-gray-900 border border-orange-500 rounded"
                    >
                      <option value="mechanic">Mechanic</option>
                      <option value="advisor">Advisor</option>
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={() => handleUpdate(user.id)}
                        className="bg-green-600 text-white px-3 py-1 rounded"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingUserId(null);
                          setEditFields(null);
                        }}
                        className="bg-gray-600 text-white px-3 py-1 rounded"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col md:flex-row justify-between w-full md:items-center">
                    <p>
                      <span className="text-orange-400">{user.full_name}</span>{" "}
                      – {user.email} ({user.role})
                    </p>
                    <div className="flex gap-2 mt-2 md:mt-0">
                      <button
                        onClick={() => {
                          setEditingUserId(user.id);
                          setEditFields({
                            full_name: user.full_name || "",
                            email: user.email || "",
                            role: user.role as Role,
                          });
                        }}
                        className="bg-blue-600 text-white px-3 py-1 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(user.id)}
                        className="bg-red-600 text-white px-3 py-1 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-4 mt-6">
            {currentPage > 1 && (
              <button
                onClick={() => setCurrentPage((p) => p - 1)}
                className="text-orange-500 hover:underline"
              >
                ← Prev
              </button>
            )}
            {currentPage * USERS_PER_PAGE < filteredUsers.length && (
              <button
                onClick={() => setCurrentPage((p) => p + 1)}
                className="text-orange-500 hover:underline"
              >
                Next →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
