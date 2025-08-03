import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const response = await fetch(
      'https://scjkmuwvdakaandjoigx.supabase.co/functions/v1/send-email',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          email,
          subject: 'Confirm your ProFixIQ account',
          html: `
            <h2>Confirm Your Email</h2>
            <p>Thanks for signing up with ProFixIQ!</p>
            <p><a href="${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback">Click here to confirm your email</a></p>
          `,
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Edge Function failed: ${errText}`);
    }

    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Error sending confirmation:', message);
    return res.status(500).json({ error: message });
  }
}