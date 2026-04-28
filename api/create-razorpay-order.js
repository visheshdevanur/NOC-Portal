export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
  const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    console.error('Missing env vars: RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET');
    return res.status(500).json({ 
      error: 'Razorpay keys not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Vercel environment variables.' 
    });
  }

  try {
    const { amount, receipt } = req.body || {};

    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${credentials}`,
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: 'INR',
        receipt: String(receipt || `rcpt_${Date.now()}`)
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Razorpay API error:', JSON.stringify(data));
      return res.status(response.status).json({ 
        error: data.error?.description || 'Failed to create Razorpay order' 
      });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Server error creating order:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
