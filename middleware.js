/**
 * Vercel Edge Middleware
 * 
 * Handles HDFC SmartGateway POST redirect to /payment/callback.
 * Vercel can't serve static files on POST (returns 405), so this
 * middleware intercepts POST requests and converts them to GET redirects.
 */
export default function middleware(request) {
  const url = new URL(request.url);

  // Only intercept POST requests to payment callback paths
  if (request.method === 'POST' && 
      (url.pathname === '/payment/callback' || url.pathname === '/api/payment/callback')) {
    
    // Redirect to the SPA route using GET (303 See Other)
    const redirectUrl = new URL('/payment/callback', url.origin);
    
    // Preserve any query params from the original request
    url.searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value);
    });

    return Response.redirect(redirectUrl.toString(), 303);
  }
}

export const config = {
  matcher: ['/payment/callback', '/api/payment/callback'],
};
