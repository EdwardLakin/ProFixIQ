'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@components/ui/Button';

export default function CustomerVehicleFormPage() {
  const router = useRouter();

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
    group: 'customer' | 'vehicle'
  ) => {
    const { name, value } = e.target;
    if (group === 'customer') {
      setCustomer((prev) => ({ ...prev, [name]: value }));
    } else {
      setVehicle((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleStart = () => {
    const query = new URLSearchParams(
      Object.entries({ ...customer, ...vehicle }).reduce((acc, [key, value]) => {
        acc[key] = value.toString() || '';
        return acc;
      }, {} as Record<string, string>)
    ).toString();

    router.push(`/inspection/menu?${query}`);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold text-center mb-6 font-blackOps">
        Enter Customer & Vehicle Info
      </h1>

      {/* Customer Info */}
      <div className="bg-zinc-900 rounded-lg p-4 mb-6 shadow">
        <h2 className="text-xl font-semibold mb-2 text-orange-400">Customer Info</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            name="first_name"
            placeholder="First Name"
            value={customer.first_name}
            onChange={(e) => handleChange(e, 'customer')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="text"
            name="last_name"
            placeholder="Last Name"
            value={customer.last_name}
            onChange={(e) => handleChange(e, 'customer')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="tel"
            name="phone"
            placeholder="Phone"
            value={customer.phone}
            onChange={(e) => handleChange(e, 'customer')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={customer.email}
            onChange={(e) => handleChange(e, 'customer')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
        </div>
      </div>

      {/* Vehicle Info */}
      <div className="bg-zinc-900 rounded-lg p-4 mb-6 shadow">
        <h2 className="text-xl font-semibold mb-2 text-orange-400">Vehicle Info</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            name="year"
            placeholder="Year"
            value={vehicle.year}
            onChange={(e) => handleChange(e, 'vehicle')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="text"
            name="make"
            placeholder="Make"
            value={vehicle.make}
            onChange={(e) => handleChange(e, 'vehicle')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="text"
            name="model"
            placeholder="Model"
            value={vehicle.model}
            onChange={(e) => handleChange(e, 'vehicle')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="text"
            name="vin"
            placeholder="VIN"
            value={vehicle.vin}
            onChange={(e) => handleChange(e, 'vehicle')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="text"
            name="license_plate"
            placeholder="License Plate"
            value={vehicle.license_plate}
            onChange={(e) => handleChange(e, 'vehicle')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="text"
            name="mileage"
            placeholder="Mileage"
            value={vehicle.mileage}
            onChange={(e) => handleChange(e, 'vehicle')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
          <input
            type="text"
            name="color"
            placeholder="Color"
            value={vehicle.color}
            onChange={(e) => handleChange(e, 'vehicle')}
            className="bg-zinc-800 text-white p-2 rounded"
          />
        </div>
      </div>

      <Button
  type="button"
  onClick={async () => {
    const query = new URLSearchParams({
      ...customer,
      ...vehicle,
    }).toString();

    const requiredCustomerFields = ['first_name', 'last_name', 'phone', 'email'];
    const requiredVehicleFields = ['make', 'model', 'year', 'vin'];

    const missingFields = requiredCustomerFields.filter(field => !customer[field as keyof typeof customer])
    .concat(requiredVehicleFields.filter(field => !vehicle[field as keyof typeof vehicle]));

    if (missingFields.length > 0) {
    alert(`Please fill in all required fields: ${missingFields.join(', ')}`);
    return;
  }

    await fetch('/api/inspection/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer,
        vehicle,
        inspectionType: 'maintenance50',
      }),
    });

    router.push(`/inspection/maintenance50?${query}`);
  }}
  className="bg-orange-500 hover:bg-orange-600 text-white text-lg font-bold px-6 py-3 rounded"
>
  Start Inspection
</Button>
    </div>
  );
}