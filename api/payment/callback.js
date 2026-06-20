/**
 * Vercel Serverless Function — handles POST from HDFC SmartGateway
 * after payment completion. HDFC sends a POST with form data,
 * but our SPA needs a GET request. This function captures the POST
 * and redirects to the SPA callback page with query params preserved.
 */
export default function handler(req, res) {
  // Preserve any query params from the original return URL
  const url = new URL(req.url, `https://${req.headers.host}`);
  const queryString = url.search || '';

  // If HDFC sent form-encoded body params, also pass them as query params
  // (the SPA reads order_id and order_token from the URL)
  const bodyParams = req.body || {};
  const merged = new URLSearchParams(queryString);

  // Add any body params that aren't already in query string
  for (const [key, value] of Object.entries(bodyParams)) {
    if (!merged.has(key) && typeof value === 'string') {
      merged.set(key, value);
    }
  }

  const finalQuery = merged.toString();
  const redirectUrl = `/payment/callback${finalQuery ? `?${finalQuery}` : ''}`;

  // 303 See Other — forces browser to use GET for the redirect
  res.writeHead(303, { Location: redirectUrl });
  res.end();
}
