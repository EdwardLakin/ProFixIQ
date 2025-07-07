'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export default function CustomerVehicleFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inspectionType = searchParams.get('inspectionType') || 'maintenance50';

  const [customer, setCustomer] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
  });

  const [vehicle, setVehicle] = useState({
    year: '',
    make: '',
    model: '',
    vin: '',
    license_plate: '',
    mileage: '',
    color: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'customer' | 'vehicle'
  ) => {
    const { name, value } = e.target;
    if (type === 'customer') {
      setCustomer(prev => ({ ...prev, [name]: value }));
    } else {
      setVehicle(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleStart = async () => {
    const query = new URLSearchParams({
      ...customer,
      ...vehicle,
    });

    if (
      !customer.first_name ||
      !customer.last_name ||
      !vehicle.make ||
      !vehicle.model
    ) {
      alert('Please fill in all required fields.');
      return;
    }

    // Save session to DB
    await fetch('/api/inspection/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer, vehicle }),
    });

    // Save to localStorage
    localStorage.setItem('inspectionCustomer', JSON.stringify(customer));
    localStorage.setItem('inspectionVehicle', JSON.stringify(vehicle));

    // Navigate with query string
    router.push(`/inspection/${inspectionType}?${query.toString()}`);
  };

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">Enter Customer & Vehicle Info</h1>

      {/* Customer Info */}
      <div>
        <input type="text" name="first_name" placeholder="First Name" value={customer.first_name} onChange={e => handleChange(e, 'customer')} className="input" />
        <input type="text" name="last_name" placeholder="Last Name" value={customer.last_name} onChange={e => handleChange(e, 'customer')} className="input" />
        <input type="text" name="phone" placeholder="Phone" value={customer.phone} onChange={e => handleChange(e, 'customer')} className="input" />
        <input type="email" name="email" placeholder="Email" value={customer.email} onChange={e => handleChange(e, 'customer')} className="input" />
      </div>

      {/* Vehicle Info */}
      <div>
        <input type="text" name="year" placeholder="Year" value={vehicle.year} onChange={e => handleChange(e, 'vehicle')} className="input" />
        <input type="text" name="make" placeholder="Make" value={vehicle.make} onChange={e => handleChange(e, 'vehicle')} className="input" />
        <input type="text" name="model" placeholder="Model" value={vehicle.model} onChange={e => handleChange(e, 'vehicle')} className="input" />
        <input type="text" name="vin" placeholder="VIN" value={vehicle.vin} onChange={e => handleChange(e, 'vehicle')} className="input" />
        <input type="text" name="license_plate" placeholder="License Plate" value={vehicle.license_plate} onChange={e => handleChange(e, 'vehicle')} className="input" />
        <input type="text" name="mileage" placeholder="Mileage" value={vehicle.mileage} onChange={e => handleChange(e, 'vehicle')} className="input" />
        <input type="text" name="color" placeholder="Color" value={vehicle.color} onChange={e => handleChange(e, 'vehicle')} className="input" />
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold px-6 py-3 rounded w-full"
      >
        Start Inspection
      </button>
    </div>
  );
}