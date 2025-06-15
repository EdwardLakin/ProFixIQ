'use client';

import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AnalyzePayload = {
  image: File;
  vehicle: {
    year: string;
    make: string;
    model: string;
  };
};

export async function analyzeImage(image: File, vehicle: AnalyzePayload['vehicle']) {
  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]; // strip the "data:image/jpeg;base64," part
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const base64Image = await toBase64(image);

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image: base64Image,
      vehicle
    })
  });

  return res.json();
}