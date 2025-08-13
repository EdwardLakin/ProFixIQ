"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import { Input } from "@shared/components/ui/input";
import { Button } from "@shared/components/ui/Button";
import type { Database } from "@shared/types/types/supabase";

const supabase = createClientComponentClient<Database>();

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
    };
    loadUser();
  }, []);

  const handlePasswordUpdate = async () => {
    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Password updated successfully.");
      router.refresh(); // use the router
    }
  };

  const handleResendVerification = async () => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Verification email resent.");
      router.refresh(); // use the router
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const filePath = `avatars/${crypto.randomUUID()}-${file.name}`;
    const { error } = await supabase.storage
      .from("profile-photos")
      .upload(filePath, file, { upsert: true });

    if (error) {
      setMessage(error.message);
    } else {
      const { data } = supabase.storage
        .from("profile-photos")
        .getPublicUrl(filePath);
      setPhotoUrl(data.publicUrl);
      setMessage("Photo uploaded.");
      router.refresh(); // use the router
    }
  };

  return (
    <div className="max-w-xl mx-auto py-10 space-y-10 text-white">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-orange-400">User Settings</h1>
        <Button variant="outline" onClick={() => router.back()}>
          Back
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Change Password</h2>
        <Input
          type="password"
          placeholder="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-2"
        />
        <Input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mb-2"
        />
        <Button onClick={handlePasswordUpdate}>Update Password</Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Email Verification</h2>
        <p className="text-sm mb-2">Current email: {email}</p>
        <Button onClick={handleResendVerification}>
          Resend Verification Email
        </Button>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Profile Photo</h2>
        <Input type="file" accept="image/*" onChange={handlePhotoUpload} className="mb-2" />
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Profile"
            className="w-24 h-24 rounded-full object-cover border border-white mt-2"
          />
        )}
      </div>

      {message && <p className="text-green-400 font-medium">{message}</p>}
    </div>
  );
}