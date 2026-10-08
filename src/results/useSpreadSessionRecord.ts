import { useEffect, useState } from 'react';
import { loadSpreadSessionRecord } from './repository';
import { loadSpreadSession, SPREAD_SESSION_SAVED_EVENT } from './storage';
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
    const localSession = loadSpreadSession(sessionId);

    setState({
      loading: !localSession,
      session: localSession,
      source: localSession ? 'local' : 'none',
      error: null
    });

    const onSaved = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== sessionId) return;
      const updated = loadSpreadSession(sessionId);
      if (updated) setState({ loading: false, session: updated, source: 'local', error: null });
    };
    window.addEventListener(SPREAD_SESSION_SAVED_EVENT, onSaved);

    if (!localSession) void loadSpreadSessionRecord(sessionId).then((result) => {
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
      window.removeEventListener(SPREAD_SESSION_SAVED_EVENT, onSaved);
    };
  }, [sessionId]);

  return state;
}
