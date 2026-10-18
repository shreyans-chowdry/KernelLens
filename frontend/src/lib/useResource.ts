'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from './api';

export interface Resource<T> {
  data: T | undefined;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
}

/**
 * Loads data once per `key` and exposes reload(). State is only set from
 * promise callbacks, never synchronously inside the effect body.
 */
export function useResource<T>(loader: () => Promise<T>, key: string): Resource<T> {
  const [state, setState] = useState<{ data: T | undefined; error: ApiError | null; loading: boolean }>({
    data: undefined,
    error: null,
    loading: true,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    loader().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (err: unknown) =>
        alive &&
        setState((s) => ({
          data: s.data,
          error: err instanceof ApiError ? err : new ApiError(String(err), null),
          loading: false,
        })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    setNonce((n) => n + 1);
  }, []);

  const setData = useCallback((updater: (prev: T | undefined) => T | undefined) => {
    setState((s) => ({ ...s, data: updater(s.data) }));
  }, []);

  return { ...state, reload, setData };
}
