export async function analyzeDTC(code: string, vehicle: any): Promise<{ result: string }> {
  const res = await fetch('/api/diagnose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, vehicle }),
  });

  if (!res.ok) throw new Error('DTC Analysis failed');

  return res.json();
}