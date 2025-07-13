import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@custom-types/supabase';

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  let customer, vehicle;

  // Safely parse JSON body
  try {
    const body = await req.json();
    customer = body.customer;
    vehicle = body.vehicle;
  } catch (err) {
    console.error('❌ Invalid JSON body:', err);
    return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
  }

  // Validate expected structure
  if (!customer || !vehicle) {
    return NextResponse.json({ error: 'Missing customer or vehicle data' }, { status: 400 });
  }

  // Get logged-in user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
  console.error('❌ No user session found');
  return NextResponse.json({ error: 'Unauthorized - No user logged in' }, { status: 401 });
}

  // Insert customer
  const { data: customerData, error: customerError } = await supabase
    .from('customers')
    .insert({
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
      email: customer.email,
    })
    .select()
    .single();

  if (customerError || !customerData) {
    return NextResponse.json({ error: 'Customer save failed' }, { status: 500 });
  }

  // Insert vehicle and link to customer
  const { data: vehicleData, error: vehicleError } = await supabase
    .from('vehicles')
    .insert({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      vin: vehicle.vin,
      license_plate: vehicle.license_plate,
      mileage: vehicle.mileage,
      color: vehicle.color,
      customer_id: customerData.id,
    })
    .select()
    .single();

  if (vehicleError || !vehicleData) {
    return NextResponse.json({ error: 'Vehicle save failed' }, { status: 500 });
  }

  // Insert empty inspection with linked vehicle UUID
  const { data: inspectionData, error: inspectionError } = await supabase
    .from('inspections')
    .insert({
      user_id: user.id,
      template: 'maintenance50',
      result: {},
      vehicle: vehicleData.id, // UUID from vehicles table
    })
    .select()
    .single();

  if (inspectionError || !inspectionData) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  // ✅ Success
  return NextResponse.json({ success: true, inspectionId: inspectionData.id });
}