// lib/analyze.ts

type VehicleInfo = {
  year: string;
  make: string;
  model: string;
};

export async function analyzeWithTechBot(message: string, vehicle: VehicleInfo) {
  try {
    const res = await fetch('/api/chat/route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        vehicle,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('TechBot API error:', errorText);
      throw new Error(`API Error: ${errorText}`);
    }

    const data = await res.json();
    return data.result; // expecting { result: "..." }
  } catch (error: any) {
    console.error('Error in analyzeWithTechBot:', error.message || error);
    return 'Something went wrong while contacting TechBot. Please try again.';
  }
}