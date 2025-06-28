'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function CreateWorkOrderPage() {
  const router = useRouter();

  const [customer, setCustomer] = useState({
    name: '',
    address: '',
    city: '',
    province: '',
    postal: '',
    phone: '',
    email: '',
  });

  const [vehicle, setVehicle] = useState({
    year: '',
    make: '',
    model: '',
    vin: '',
  });

  const [inspectionType, setInspectionType] = useState('');
  const [concerns, setConcerns] = useState([{ description: '', labor: '', price: '' }]);
  const [loading, setLoading] = useState(false);

  const handleConcernChange = (
    index: number,
    field: string,
    value: string
  ) => {
    const updated = [...concerns];
    updated[index][field as keyof typeof updated[0]] = value;
    setConcerns(updated);
  };

  const handleAddConcern = () => {
    setConcerns([...concerns, { description: '', labor: '', price: '' }]);
  };

  const handleSubmit = async () => {
    setLoading(true);

    const { name, address, city, province, postal, phone, email } = customer;
    const { year, make, model, vin } = vehicle;

    const { error: lineError } = await supabase.from('work_order_lines').insert(
      concerns.map(line => ({
        customer_name: name,
        address,
        city,
        province,
        postal,
        phone,
        email,
        year,
        make,
        model,
        vin,
        inspection_type: inspectionType,
        description: line.description,
        labor: line.labor,
        price: line.price,
      }))
    );

    if (lineError) {
      alert('Error saving work order lines');
    }

    setLoading(false);
    router.push('/work-orders');
  };

  return (
    <div className="max-w-3xl mx-auto px-6 pt-6">
      <PreviousPageButton to="/work-orders" />

      <div className="bg-black border border-orange-500 rounded-lg p-6 mb-6 text-center">
        <h1 className="text-5xl font-black font-blackops text-orange-400">Create Work Order</h1>
        <p className="text-white mt-2">Start a new repair or inspection</p>
      </div>

      <div className="bg-black border border-orange-500 rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-black font-blackops text-orange-400 text-center mb-2">Customer Info</h2>
        <p className="text-white text-center mb-4">ProFixIQ</p>
        {['name', 'address', 'city', 'province', 'postal', 'phone', 'email'].map(field => (
          <input
            key={field}
            type="text"
            placeholder={field[0].toUpperCase() + field.slice(1)}
            className="w-full p-2 mb-2 rounded bg-black/20 text-white"
            value={customer[field as keyof typeof customer]}
            onChange={e => setCustomer({ ...customer, [field]: e.target.value })}
          />
        ))}
      </div>

      <div className="bg-black border border-orange-500 rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-black font-blackops text-orange-400 text-center mb-2">Vehicle Info</h2>
        <p className="text-white text-center mb-4">ProFixIQ</p>
        {['year', 'make', 'model', 'vin'].map(field => (
          <input
            key={field}
            type="text"
            placeholder={field.toUpperCase()}
            className="w-full p-2 mb-2 rounded bg-black/20 text-white"
            value={vehicle[field as keyof typeof vehicle]}
            onChange={e => setVehicle({ ...vehicle, [field]: e.target.value })}
          />
        ))}
      </div>

      <div className="bg-black border border-orange-500 rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-black font-blackops text-orange-400 text-center mb-2">Select Inspection</h2>
        <p className="text-white text-center mb-4">ProFixIQ</p>
        <select
          className="w-full p-2 mb-4 rounded bg-black/20 text-white"
          value={inspectionType}
          onChange={e => setInspectionType(e.target.value)}
        >
          <option value="">Select an Inspection</option>
          <option value="maintenance50">Maintenance 50 Point</option>
          <option value="brake">Brake Inspection</option>
          <option value="diagnostic">Diagnostic</option>
        </select>
      </div>

      <div className="bg-black border border-orange-500 rounded-lg p-6 mb-6">
        <h2 className="text-2xl font-black font-blackops text-orange-400 text-center mb-2">Concerns</h2>
        <p className="text-white text-center mb-4">ProFixIQ</p>
        {concerns.map((line, idx) => (
          <div key={idx} className="flex space-x-2 mb-2">
            <input
              type="text"
              placeholder="Description"
              className="w-1/3 p-2 rounded bg-black/20 text-white"
              value={line.description}
              onChange={e => handleConcernChange(idx, 'description', e.target.value)}
            />
            <input
              type="text"
              placeholder="Labor"
              className="w-1/3 p-2 rounded bg-black/20 text-white"
              value={line.labor}
              onChange={e => handleConcernChange(idx, 'labor', e.target.value)}
            />
            <input
              type="text"
              placeholder="Price"
              className="w-1/3 p-2 rounded bg-black/20 text-white"
              value={line.price}
              onChange={e => handleConcernChange(idx, 'price', e.target.value)}
            />
          </div>
        ))}
        <button onClick={handleAddConcern} className="text-sm text-orange-400 underline mb-4">+ Add Concern</button>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-6 w-full p-3 bg-orange-500 text-white rounded font-bold"
      >
        {loading ? 'Submitting...' : 'Create Work Order'}
      </button>
    </div>
  );
}