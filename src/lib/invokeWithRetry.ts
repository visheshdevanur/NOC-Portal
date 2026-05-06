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
 * Non-retryable errors (4xx) throw immediately.
 */
export async function invokeWithRetry<T = unknown>(
  functionName: string,
  body: Record<string, unknown>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(functionName, { body });

      if (error) {
        // Check if error is retryable
        const status = (error as any)?.status || (error as any)?.context?.status || 500;
        
        if (attempt < opts.maxRetries && opts.retryableStatuses.includes(status)) {
          lastError = new Error(error.message || `Edge Function error (${status})`);
          const delay = Math.min(opts.baseDelay * Math.pow(2, attempt), opts.maxDelay);
          // Add jitter (±25%)
          const jitter = delay * (0.75 + Math.random() * 0.5);
          await new Promise(resolve => setTimeout(resolve, jitter));
          continue;
        }

        throw new Error(error.message || 'Edge Function call failed');
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
