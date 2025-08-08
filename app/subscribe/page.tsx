"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [_loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) {
      setLoading(false);
      return;
    }

    const fetchEmail = async () => {
      try {
        const res = await fetch(`/api/stripe/session?session_id=${sessionId}`);
        const data = await res.json();
        if (data?.email) {
          setEmail(data.email);
        }
      } catch (err) {
        console.error("Failed to fetch session:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchEmail();
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <form className="max-w-md w-full space-y-4 bg-gray-900 p-6 rounded">
        <h2 className="text-2xl font-semibold">Sign Up</h2>

        <input
          type="email"
          value={email}
          placeholder="Email"
          className="w-full p-2 rounded bg-gray-800 border border-gray-700"
          readOnly
        />

        <input
          type="password"
          placeholder="Create password"
          className="w-full p-2 rounded bg-gray-800 border border-gray-700"
        />

        <button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded"
        >
          Create Account
        </button>
      </form>
    </div>
  );
}
