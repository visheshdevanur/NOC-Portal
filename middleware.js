/**
 * Vercel Edge Middleware
 * 
 * Handles HDFC SmartGateway POST redirect to /payment/callback.
 * Vercel can't serve static files on POST (returns 405), so this
 * middleware intercepts POST requests and converts them to GET redirects.
 * 
 * HDFC sends payment result as POST form data — we extract key fields
 * and forward them as query parameters so the SPA callback page can read them.
 */
export default async function middleware(request) {
  const url = new URL(request.url);

  // Only intercept POST requests to payment callback paths
  if (request.method === 'POST' && 
      (url.pathname === '/payment/callback' || url.pathname === '/api/payment/callback')) {
    
    const redirectUrl = new URL('/payment/callback', url.origin);
    
    // Preserve any existing query params
    url.searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value);
    });

    // Extract order_id and status from HDFC POST body (form-urlencoded)
    try {
      const contentType = request.headers.get('content-type') || '';
      let orderId = '';
      let status = '';

      if (contentType.includes('application/x-www-form-urlencoded')) {
        const body = await request.text();
        const params = new URLSearchParams(body);
        orderId = params.get('order_id') || params.get('orderId') || '';
        status = params.get('status') || '';
      } else if (contentType.includes('application/json')) {
        const body = await request.json();
        orderId = body.order_id || body.orderId || '';
        status = body.status || '';
      }

      if (orderId) redirectUrl.searchParams.set('order_id', orderId);
      if (status) redirectUrl.searchParams.set('status', status);
    } catch (e) {
      // If body parsing fails, continue with redirect anyway
    }

    return Response.redirect(redirectUrl.toString(), 303);
  }
}

export const config = {
  matcher: ['/payment/callback', '/api/payment/callback'],
};
