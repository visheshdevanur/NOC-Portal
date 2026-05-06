import { useApiMutation } from '../../src/lib/useApiMutation';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

describe('useApiMutation', () => {
  it('starts with clean state', () => {
    const { result } = renderHook(() => useApiMutation());
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
  });

  it('sets loading true during mutation', async () => {
    const { result } = renderHook(() => useApiMutation());
    
    let resolvePromise: () => void;
    const promise = new Promise<void>(resolve => { resolvePromise = resolve; });
    
    act(() => {
      result.current.mutate(() => promise);
    });
    
    expect(result.current.loading).toBe(true);
    
    await act(async () => { resolvePromise!(); });
    expect(result.current.loading).toBe(false);
  });

  it('sets success message on successful mutation', async () => {
    const { result } = renderHook(() => useApiMutation());
    
    await act(async () => {
      await result.current.mutate(
        () => Promise.resolve('data'),
        { successMessage: 'Done!' }
      );
    });
    
    expect(result.current.success).toBe('Done!');
    expect(result.current.error).toBeNull();
  });

  it('sets error message on failed mutation', async () => {
    const { result } = renderHook(() => useApiMutation());
    
    await act(async () => {
      await result.current.mutate(
        () => Promise.reject(new Error('Network error'))
      );
    });
    
    expect(result.current.error).toBe('Network error');
    expect(result.current.success).toBeNull();
  });

  it('calls onSuccess callback with result', async () => {
    const { result } = renderHook(() => useApiMutation());
    const onSuccess = vi.fn();
    
    await act(async () => {
      await result.current.mutate(
        () => Promise.resolve({ id: 1 }),
        { onSuccess }
      );
    });
    
    expect(onSuccess).toHaveBeenCalledWith({ id: 1 });
  });

  it('calls onError callback on failure', async () => {
    const { result } = renderHook(() => useApiMutation());
    const onError = vi.fn();
    
    await act(async () => {
      await result.current.mutate(
        () => Promise.reject(new Error('fail')),
        { onError }
      );
    });
    
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('clearMessages resets error and success', async () => {
    const { result } = renderHook(() => useApiMutation());
    
    await act(async () => {
      await result.current.mutate(
        () => Promise.reject(new Error('err'))
      );
    });
    
    expect(result.current.error).toBe('err');
    
    act(() => { result.current.clearMessages(); });
    
    expect(result.current.error).toBeNull();
    expect(result.current.success).toBeNull();
  });
});
