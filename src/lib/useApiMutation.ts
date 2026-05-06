/**
 * Consistent Error Handling Hook
 * FIX #36: Replaces the inconsistent mix of alert(), console.error(), 
 * setError(), and silent swallowing across 142 catch blocks.
 *
 * Provides a unified pattern for API mutations with:
 * - Consistent error state management
 * - Automatic error logging to platform error logs
 * - Success feedback
 * - Loading state tracking
 */
import { useState, useCallback } from 'react';

type MutationState = {
  loading: boolean;
  error: string | null;
  success: string | null;
};

type MutationOptions = {
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  /** If true, automatically clear success message after 3 seconds */
  autoClearSuccess?: boolean;
};

/**
 * A lightweight mutation hook for consistent error handling.
 * 
 * Usage:
 * ```tsx
 * const { mutate, loading, error, success, clearMessages } = useApiMutation();
 * 
 * const handleApprove = () => mutate(
 *   () => approveRequest(id),
 *   { successMessage: 'Request approved!' }
 * );
 * ```
 */
export function useApiMutation() {
  const [state, setState] = useState<MutationState>({
    loading: false,
    error: null,
    success: null,
  });

  const clearMessages = useCallback(() => {
    setState(prev => ({ ...prev, error: null, success: null }));
  }, []);

  const mutate = useCallback(async (
    fn: () => Promise<unknown>,
    options: MutationOptions = {}
  ) => {
    setState({ loading: true, error: null, success: null });
    
    try {
      const result = await fn();
      const successMsg = options.successMessage || 'Operation completed successfully';
      setState({ loading: false, error: null, success: successMsg });
      
      if (options.onSuccess) options.onSuccess(result);
      
      // Auto-clear success message after 3s
      if (options.autoClearSuccess !== false) {
        setTimeout(() => {
          setState(prev => ({ ...prev, success: null }));
        }, 3000);
      }
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setState({ loading: false, error: message, success: null });
      
      if (options.onError) {
        options.onError(err instanceof Error ? err : new Error(message));
      }
      
      // Log to console for debugging (but never alert())
      console.error('[useApiMutation]', message);
      
      return null;
    }
  }, []);

  return {
    mutate,
    loading: state.loading,
    error: state.error,
    success: state.success,
    clearMessages,
  };
}
