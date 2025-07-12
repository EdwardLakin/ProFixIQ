// app/api/inspection/save/route.ts

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@custom-types/supabase';

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { customer, vehicle } = await req.json();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Insert customer
  const { data: newCustomer, error: customerError } = await supabase
    .from('customers')
    .insert({
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      email: customer.email,
    })
    .select()
    .single();

  if (customerError) {
    return NextResponse.json({ error: customerError.message }, { status: 500 });
  }

  // Insert vehicle
  const { data: newVehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .insert({
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      vin: vehicle.vin,
      license_plate: vehicle.license_plate,
      mileage: vehicle.mileage,
      color: vehicle.color,
      customer_id: newCustomer.id,
    })
    .select()
    .single();

  if (vehicleError) {
    return NextResponse.json({ error: vehicleError.message }, { status: 500 });
  }

  // Insert inspection
  const { data: newInspection, error: inspectionError } = await supabase
    .from('inspections')
    .insert({
      user_id: user.id,
      template: 'maintenance50',
      result: {}, // Optional placeholder
      vehicle: newVehicle.id,
    })
    .select()
    .single();

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    inspectionId: newInspection.id,
  });
}