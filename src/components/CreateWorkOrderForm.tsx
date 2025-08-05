'use client';

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CreateWorkOrderForm() {
  const [customer, setCustomer] = useState({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    phone: '',
    email: '',
  });

  const [vehicle, setVehicle] = useState({
    year: '',
    make: '',
    model: '',
    vin: '',
  });

  const [inspection, setInspection] = useState('');
  const [concerns, setConcerns] = useState<string[]>(['']);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleAddConcern = () => {
    setConcerns([...concerns, '']);
  };

  const handleConcernChange = (index: number, value: string) => {
    const updated = [...concerns];
    updated[index] = value;
    setConcerns(updated);
  };

  const handleSubmit = async () => {
    setLoading(true);
    setMessage('');

    try {
      const workOrderId = uuidv4();

      const { error: orderError } = await supabase.from('work_orders').insert({
        id: workOrderId,
        customer_name: customer.name,
        customer_address: `${customer.address}, ${customer.city}, ${customer.postalCode}`,
        customer_phone: customer.phone,
        customer_email: customer.email,
        vehicle_year: vehicle.year,
        vehicle_make: vehicle.make,
        vehicle_model: vehicle.model,
        vehicle_vin: vehicle.vin,
        inspection_type: inspection,
        status: 'active',
        created_at: new Date().toISOString(),
      });

      if (orderError) throw orderError;

      const lineInserts = concerns
        .filter(c => c.trim() !== '')
        .map(description => ({
          work_order_id: workOrderId,
          description,
          status: 'pending',
        }));

      if (lineInserts.length > 0) {
        const { error: lineError } = await supabase.from('work_order_lines').insert(lineInserts);
        if (lineError) throw lineError;
      }

      setMessage('Work order created successfully!');
      setCustomer({ name: '', address: '', city: '', postalCode: '', phone: '', email: '' });
      setVehicle({ year: '', make: '', model: '', vin: '' });
      setInspection('');
      setConcerns(['']);
    } catch (err) {
  if (err instanceof Error) {
    console.error('❌ Error creating work order:', err.message);
  } else {
    console.error('❌ Unknown error creating work order:', err);
  }
  setMessage('❌ Failed to create work order.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto mt-8 p-6 border border-orange-500 rounded-xl bg-black/60 backdrop-blur-md shadow-card text-white space-y-4">
      <h2 className="text-3xl font-bold text-center text-yellow-400 font-blackops">Create Work Order</h2>

      {/* Customer Info */}
      <div>
        <h3 className="text-xl font-semibold text-orange-400">Customer Information</h3>
        <input type="text" placeholder="Name" value={customer.name} onChange={e => setCustomer({ ...customer, name: e.target.value })} className="input" />
        <input type="text" placeholder="Address" value={customer.address} onChange={e => setCustomer({ ...customer, address: e.target.value })} className="input" />
        <div className="flex gap-2">
          <input type="text" placeholder="City" value={customer.city} onChange={e => setCustomer({ ...customer, city: e.target.value })} className="input flex-1" />
          <input type="text" placeholder="Postal Code" value={customer.postalCode} onChange={e => setCustomer({ ...customer, postalCode: e.target.value })} className="input flex-1" />
        </div>
        <input type="text" placeholder="Phone" value={customer.phone} onChange={e => setCustomer({ ...customer, phone: e.target.value })} className="input" />
        <input type="email" placeholder="Email" value={customer.email} onChange={e => setCustomer({ ...customer, email: e.target.value })} className="input" />
      </div>

      {/* Vehicle Info */}
      <div>
        <h3 className="text-xl font-semibold text-orange-400">Vehicle Information</h3>
        <div className="flex gap-2">
          <input type="text" placeholder="Year" value={vehicle.year} onChange={e => setVehicle({ ...vehicle, year: e.target.value })} className="input flex-1" />
          <input type="text" placeholder="Make" value={vehicle.make} onChange={e => setVehicle({ ...vehicle, make: e.target.value })} className="input flex-1" />
        </div>
        <input type="text" placeholder="Model" value={vehicle.model} onChange={e => setVehicle({ ...vehicle, model: e.target.value })} className="input" />
        <input type="text" placeholder="VIN" value={vehicle.vin} onChange={e => setVehicle({ ...vehicle, vin: e.target.value })} className="input" />
      </div>

      {/* Inspection Type */}
      <div>
        <h3 className="text-xl font-semibold text-orange-400">Inspection</h3>
        <select value={inspection} onChange={e => setInspection(e.target.value)} className="input">
          <option value="">Select Inspection Type</option>
          <option value="Full Inspection">Full Inspection</option>
          <option value="Diagnostic Only">Diagnostic Only</option>
          <option value="No Inspection">No Inspection</option>
        </select>
      </div>

      {/* Concern Lines */}
      <div>
        <h3 className="text-xl font-semibold text-orange-400">Concerns</h3>
        {concerns.map((concern, index) => (
          <input
            key={index}
            type="text"
            placeholder={`Concern #${index + 1}`}
            value={concern}
            onChange={e => handleConcernChange(index, e.target.value)}
            className="input"
          />
        ))}
        <button onClick={handleAddConcern} className="text-sm text-yellow-300 hover:underline mt-1">+ Add Concern</button>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full mt-4 py-3 font-blackops text-lg rounded bg-orange-600 hover:bg-orange-700 transition-all"
      >
        {loading ? 'Creating...' : 'Create Work Order'}
      </button>

      {/* Message */}
      {message && <p className="text-center text-sm mt-2 text-yellow-300">{message}</p>}
    </div>
  );
}

// Tailwind CSS reusable class
const input = "w-full mt-2 p-2 rounded bg-neutral-900 text-white border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-orange-500";
