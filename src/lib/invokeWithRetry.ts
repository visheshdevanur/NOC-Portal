import { supabase } from './supabase';

interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms (doubles each retry, default: 500) */
  baseDelay?: number;
  /** Maximum delay cap in ms (default: 5000) */
  maxDelay?: number;
  /** HTTP status codes that should trigger a retry (default: [429, 500, 502, 503, 504]) */
  retryableStatuses?: number[];
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 500,
  maxDelay: 5000,
  retryableStatuses: [429, 500, 502, 503, 504],
};

/**
 * Invoke a Supabase Edge Function with automatic exponential backoff retry.
 * Only retries on transient errors (5xx, 429 rate limit).
 * On 401 (expired token), refreshes session and retries once.
 * Non-retryable errors (4xx) throw immediately.
 */
export async function invokeWithRetry<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;
  let sessionRefreshed = false;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error) {
        // Try to extract the actual error message from the response
        let errorMsg = error.message || 'Edge Function call failed';
        
        // The Supabase client often returns generic "non-2xx" message.
        // The actual error is in the response context or data.
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          try {
            const errBody = await ctx.json();
            if (errBody?.error) errorMsg = errBody.error;
          } catch {}
        }

        // Check status code
        const status = (error as any)?.status || (error as any)?.context?.status || 500;
        
        // Handle 401: refresh session and retry once
        if (status === 401 && !sessionRefreshed) {
          console.warn(`[invokeWithRetry] 401 from ${functionName}, refreshing session...`);
          sessionRefreshed = true;
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) {
            console.error('[invokeWithRetry] Session refresh failed:', refreshError.message);
            throw new Error('Your session has expired. Please log in again.');
          }
          console.log('[invokeWithRetry] Session refreshed, retrying...');
          continue; // Retry with new token
        }

        // Check if error is retryable (transient)
        if (attempt < opts.maxRetries && opts.retryableStatuses.includes(status)) {
          lastError = new Error(errorMsg);
          const delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay);
          const jitter = delay * (0.75 + Math.random() * 0.5);
          await new Promise(resolve => setTimeout(resolve, jitter));
          continue;
        }

        throw new Error(errorMsg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      return data as T;
    } catch (err) {
      if (attempt >= opts.maxRetries) {
        throw lastError || err;
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      
      const delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay);
      const jitter = delay * (0.75 + Math.random() * 0.5);
      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }

  throw lastError || new Error(`Failed after ${opts.maxRetries} retries`);
}

export default invokeWithRetry;

