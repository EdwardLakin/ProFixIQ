'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import PreviousPageButton from '@components/ui/PreviousPageButton';
import '@styles/globals.css';
import supabase from '@lib/supabaseClient';

type Customer = {
  name: string;
  address: string;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
};

type Vehicle = {
  year: string;
  make: string;
  model: string;
  vin: string;
};

type Concern = {
  description: string;
  laborTime: string;
};

export default function CreateWorkOrderPage() {
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer>({
    name: '',
    address: '',
    city: '',
    province: '',
    postalCode: '',
    phone: '',
    email: '',
  });

  const [vehicle, setVehicle] = useState<Vehicle>({
    year: '',
    make: '',
    model: '',
    vin: '',
  });

  const [inspectionType, setInspectionType] = useState('');
  const [concerns, setConcerns] = useState<Concern[]>([{ description: '', laborTime: '' }]);
  const [loading, setLoading] = useState(false);

  const handleConcernChange = (index: number, field: keyof Concern, value: string) => {
    const updated = [...concerns];
    updated[index][field] = value;
    setConcerns(updated);
  };

  const handleAddConcern = () => {
    setConcerns([...concerns, { description: '', laborTime: '' }]);
  };

  const handleSubmit = async () => {
    setLoading(true);

    const workOrderId = uuidv4();

    const { name, address, city, province, postalCode, phone, email } = customer;
    const { year, make, model, vin } = vehicle;

    const { error: lineError } = await supabase.from('work_order_lines').insert(
      concerns.map((line) => ({
        work_order_id: workOrderId,
        customer_name: name,
        address,
        city,
        province,
        postal: postalCode,
        phone,
        email,
        year,
        make,
        model,
        vin,
        inspection_type: inspectionType,
        description: line.description,
        labor_time: Number(line.laborTime,)
      }))
    );

    if (lineError) {
      alert('Error saving work order lines');
      console.error(lineError);
    }

    setLoading(false);
    router.push('/work-orders');
  };

  return (
    <div className="max-w-3xl mx-auto px-6 pt-6">
      <PreviousPageButton to="/work-orders" />

      <h2 className="text-5xl font-black text-white mt-2 mb-4">Create Work Order</h2>

      <div className="grid grid-cols-1 gap-4 text-white">
        {(['name', 'address', 'city', 'province', 'postalCode', 'phone', 'email'] as const).map(
          (field) => (
            <input
              key={field}
              type="text"
              placeholder={field.toUpperCase()}
              className="bg-black/20 p-2 rounded"
              value={customer[field]}
              onChange={(e) => setCustomer({ ...customer, [field]: e.target.value })}
            />
          )
        )}

        {(['year', 'make', 'model', 'vin'] as const).map((field) => (
          <input
            key={field}
            type="text"
            placeholder={field.toUpperCase()}
            className="bg-black/20 p-2 rounded"
            value={vehicle[field]}
            onChange={(e) => setVehicle({ ...vehicle, [field]: e.target.value })}
          />
        ))}

        <select
          value={inspectionType}
          onChange={(e) => setInspectionType(e.target.value)}
          className="bg-black/20 p-2 rounded"
        >
          <option value="">Select Inspection Type</option>
          <option value="maintenance50">Maintenance 50 Point</option>
          <option value="brake">Brake Inspection</option>
          <option value="diagnostic">Diagnostic</option>
        </select>

        <h3 className="text-2xl font-black text-white mt-6">Concerns</h3>

        {concerns.map((line, idx) => (
          <div key={idx} className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Description"
              className="flex-1 bg-black/20 p-2 rounded"
              value={line.description}
              onChange={(e) => handleConcernChange(idx, 'description', e.target.value)}
            />
            <input
              type="text"
              placeholder="Labor Time"
              className="w-32 bg-black/20 p-2 rounded"
              value={line.laborTime}
              onChange={(e) => handleConcernChange(idx, 'laborTime', e.target.value)}
            />
          </div>
        ))}

        <button
          onClick={handleAddConcern}
          className="text-sm text-orange-400 underline mb-4"
        >
          + Add Concern
        </button>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="bg-orange-500 text-white font-bold p-3 rounded"
        >
          {loading ? 'Submitting...' : 'Create Work Order'}
        </button>
      </div>
    </div>
  );
}