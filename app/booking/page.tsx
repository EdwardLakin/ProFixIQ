"use client";

import React, { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@types/supabase";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient<Database>();

export default function BookingPage() {
  const router = useRouter();
  const [menuItems, setMenuItems] = useState<string[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState("");
  const [timeSlots, setTimeSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      const { data: items } = await supabase
        .from("menu_items")
        .select("complaint");
      setMenuItems(items?.map((i) => i.complaint) || []);

      const { data: slots } = await supabase
        .from("shop_time_slots")
        .select("*")
        .eq("is_booked", false);
      setTimeSlots(slots || []);
    };

    fetchData();
  }, []);

  const handleSubmit = async () => {
    if (!customerName || !selectedComplaint || !selectedSlot) {
      alert("Please fill all fields");
      return;
    }

    const { error } = await supabase.from("work_orders").insert({
      customer_name: customerName,
      customer_phone: phone,
      status: "requested",
      scheduled_time: selectedSlot,
      complaints: [selectedComplaint],
    });

    if (error) {
      alert("Failed to submit booking");
    } else {
      router.push("/thank-you");
    }
  };

  return (
    <div className="max-w-xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Request a Repair</h1>

      <label className="block mb-1">Name</label>
      <input
        className="w-full border p-2 mb-4"
        value={customerName}
        onChange={(e) => setCustomerName(e.target.value)}
      />

      <label className="block mb-1">Phone</label>
      <input
        className="w-full border p-2 mb-4"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <label className="block mb-1">Complaint</label>
      <select
        className="w-full border p-2 mb-4"
        value={selectedComplaint}
        onChange={(e) => setSelectedComplaint(e.target.value)}
      >
        <option value="">Select</option>
        {menuItems.map((item, i) => (
          <option key={i} value={item}>
            {item}
          </option>
        ))}
      </select>

      <label className="block mb-1">Available Time Slot</label>
      <select
        className="w-full border p-2 mb-4"
        value={selectedSlot}
        onChange={(e) => setSelectedSlot(e.target.value)}
      >
        <option value="">Select</option>
        {timeSlots.map((slot) => (
          <option key={slot.id} value={slot.start_time}>
            {new Date(slot.start_time).toLocaleString()}
          </option>
        ))}
      </select>

      <button
        className="bg-blue-600 text-white py-2 px-4 rounded"
        onClick={handleSubmit}
      >
        Submit Booking
      </button>
    </div>
  );
}
