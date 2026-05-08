import {
  getSupabaseClient,
  getSupabaseClientLoadError,
  isSupabaseConfigured
} from '../lib/supabase';
import {
  loadSpreadSession,
  normalizeSpreadSession,
  saveSpreadSession
} from './storage';
import { markSessionCloudError, markSessionCloudSynced } from './session';
import type { SpreadSession } from './types';

interface PersistResult {
  session: SpreadSession;
  source: 'local' | 'cloud';
  error: string | null;
}

interface LoadResult {
  session: SpreadSession | null;
  source: 'local' | 'cloud' | 'none';
  error: string | null;
}

interface SpreadSessionRow {
  id: string;
  spread_id: string;
  spread_label: string;
  card_count: number;
  revealed_at: string;
  payload: SpreadSession;
}

export async function persistSpreadSession(session: SpreadSession): Promise<PersistResult> {
  saveSpreadSession(session);

  if (!isSupabaseConfigured()) {
    const fallbackSession = markSessionCloudError(
      session,
      '当前部署没有读取到 Supabase 环境变量。'
    );
    saveSpreadSession(fallbackSession);

    return {
      session: fallbackSession,
      source: 'local',
      error: fallbackSession.persistence.lastSyncError
    };
  }

  const supabase = await getSupabaseClient();

  if (!supabase) {
    const fallbackSession = markSessionCloudError(
      session,
      getSupabaseClientLoadError() ?? 'Supabase 客户端未能加载。'
    );
    saveSpreadSession(fallbackSession);

    return {
      session: fallbackSession,
      source: 'local',
      error: fallbackSession.persistence.lastSyncError
    };
  }

  const cloudSession = markSessionCloudSynced(session);
  const row = toRow(cloudSession);

  const { error } = await supabase.from('spread_sessions').insert(row);

  if (error) {
    const fallbackSession = markSessionCloudError(session, error.message);
    saveSpreadSession(fallbackSession);

    return {
      session: fallbackSession,
      source: 'local',
      error: error.message
    };
  }

  saveSpreadSession(cloudSession);

  return {
    session: cloudSession,
    source: 'cloud',
    error: null
  };
}

export async function loadSpreadSessionRecord(sessionId: string): Promise<LoadResult> {
  const localSession = loadSpreadSession(sessionId);

  if (
    localSession &&
    (!isSupabaseConfigured() || localSession.persistence.cloudBacked)
  ) {
    return {
      session: localSession,
      source: 'local',
      error: null
    };
  }

  if (!isSupabaseConfigured()) {
    return {
      session: null,
      source: 'none',
      error: null
    };
  }

  const supabase = await getSupabaseClient();

  if (!supabase) {
    return {
      session: null,
      source: 'none',
      error: getSupabaseClientLoadError() ?? 'Supabase 客户端未能加载。'
    };
  }

  const { data, error } = await supabase
    .from('spread_sessions')
    .select('payload')
    .eq('id', sessionId)
    .limit(1);

  if (error) {
    return {
      session: null,
      source: 'none',
      error: error.message
    };
  }

  const row = data?.[0] as Pick<SpreadSessionRow, 'payload'> | undefined;
  const session = normalizeSpreadSession(row?.payload ?? null);

  if (session) {
    saveSpreadSession(session);

    return {
      session,
      source: 'cloud',
      error: null
    };
  }

  if (localSession) {
    return {
      session: localSession,
      source: 'local',
      error: null
    };
  }

  return {
    session: null,
    source: 'none',
    error: null
  };
}

function toRow(session: SpreadSession): SpreadSessionRow {
  return {
    id: session.id,
    spread_id: session.spread.id,
    spread_label: session.spread.label,
    card_count: session.spread.cardCount,
    revealed_at: session.revealedAt,
    payload: session
  };
}
