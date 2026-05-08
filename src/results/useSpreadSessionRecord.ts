import { useEffect, useState } from 'react';
import { loadSpreadSessionRecord } from './repository';
import type { SpreadSession } from './types';

interface SpreadSessionRecordState {
  loading: boolean;
  session: SpreadSession | null;
  source: 'local' | 'cloud' | 'none';
  error: string | null;
}

const initialState: SpreadSessionRecordState = {
  loading: false,
  session: null,
  source: 'none',
  error: null
};

export function useSpreadSessionRecord(sessionId: string | null) {
  const [state, setState] = useState<SpreadSessionRecordState>(initialState);

  useEffect(() => {
    if (!sessionId) {
      setState(initialState);
      return;
    }

    let cancelled = false;

    setState({
      loading: true,
      session: null,
      source: 'none',
      error: null
    });

    void loadSpreadSessionRecord(sessionId).then((result) => {
      if (!cancelled) {
        setState({
          loading: false,
          session: result.session,
          source: result.source,
          error: result.error
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return state;
}
