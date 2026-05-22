/**
 * HDFC SmartGateway Payment Callback Handler
 * 
 * HDFC redirects the browser here via POST after payment.
 * Vercel can't serve static files on POST, so this API route
 * converts the POST to a GET redirect → SPA handles the rest.
 */
export default function handler(req, res) {
  // Extract any query params HDFC might send
  const queryString = req.url?.includes('?') ? req.url.split('?')[1] : '';
  const redirectUrl = `/payment/callback${queryString ? '?' + queryString : ''}`;
  
  // 303 See Other → browser follows with GET (converts POST to GET)
  res.writeHead(303, { Location: redirectUrl });
  res.end();
}
