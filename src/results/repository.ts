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

const pendingSaves = new Map<string, Promise<PersistResult>>();

export function isSpreadSessionSaving(sessionId: string) {
  return pendingSaves.has(sessionId);
}

export function persistSpreadSession(session: SpreadSession): Promise<PersistResult> {
  const pending = pendingSaves.get(session.id);
  if (pending) return pending;
  const save = persistSpreadSessionOnce(session).finally(() => pendingSaves.delete(session.id));
  pendingSaves.set(session.id, save);
  return save;
}

async function persistSpreadSessionOnce(session: SpreadSession): Promise<PersistResult> {
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

  // A timed-out request may still have reached Supabase. Confirm before retrying
  // so a duplicate ID is treated as an already saved result.
  if (session.persistence.lastSyncError) {
    const existing = await findCloudSession(supabase, session.id);
    if (existing) {
      saveSpreadSession(existing);
      return { session: existing, source: 'cloud', error: null };
    }
  }

  let error: { message: string } | null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);
  try {
    ({ error } = await supabase.from('spread_sessions').insert(row).abortSignal(controller.signal));
  } catch (cause) {
    error = { message: controller.signal.aborted
      ? '云端保存超时，请检查网络后重试。'
      : cause instanceof Error ? cause.message : '网络请求失败。' };
  } finally {
    window.clearTimeout(timeout);
  }
  if (controller.signal.aborted) {
    error = { message: '云端保存超时，请检查网络后重试。' };
  }

  if (error) {
    if (/duplicate key|23505/i.test(error.message)) {
      const existing = await findCloudSession(supabase, session.id);
      if (existing) {
        saveSpreadSession(existing);
        return { session: existing, source: 'cloud', error: null };
      }
    }
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

async function findCloudSession(
  supabase: NonNullable<Awaited<ReturnType<typeof getSupabaseClient>>>,
  sessionId: string
) {
  try {
    const { data, error } = await supabase.from('spread_sessions')
      .select('payload').eq('id', sessionId).limit(1);
    return error ? null : normalizeSpreadSession(
      (data?.[0] as Pick<SpreadSessionRow, 'payload'> | undefined)?.payload ?? null
    );
  } catch {
    return null;
  }
}

export async function loadSpreadSessionRecord(sessionId: string): Promise<LoadResult> {
  const localSession = loadSpreadSession(sessionId);

  if (localSession) {
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
