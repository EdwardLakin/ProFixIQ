import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@custom-types/supabase';

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { customer, vehicle } = await req.json();

  // Get logged-in user
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  const { error: inspectionError } = await supabase.from('inspections').insert({
    user_id: user.id,
    template: 'maintenance50',
    result: {},
    vehicle: vehicleData.id, // ✅ Must be UUID
  });

  if (inspectionError) {
    return NextResponse.json({ error: inspectionError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}