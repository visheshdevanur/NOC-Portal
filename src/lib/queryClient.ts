/**
 * React Query Client Configuration
 * 
 * Centralized query client with production-ready defaults:
 * - 30s stale time (data is fresh for 30s before refetching)
 * - 2 retries on failure
 * - 5 minute garbage collection for inactive queries
 * - Auto-refetch on window focus
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,        // 30 seconds
      gcTime: 5 * 60 * 1000,       // 5 minutes (was cacheTime in v4)
      retry: 2,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
