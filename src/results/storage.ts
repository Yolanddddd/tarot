import { spreadMap } from '../config/spreads';
import type { SpreadSession } from './types';

const STORAGE_KEY = 'auratarot.spread.sessions.v1';

export function saveSpreadSession(session: SpreadSession) {
  try {
    const allSessions = readAllSessions();
    allSessions[session.id] = session;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allSessions));
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

export function loadSpreadSession(sessionId: string) {
  const allSessions = readAllSessions();
  return normalizeSpreadSession(allSessions[sessionId] ?? null);
}

function readAllSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {} as Record<string, SpreadSession>;
    }

    return JSON.parse(raw) as Record<string, SpreadSession>;
  } catch {
    return {} as Record<string, SpreadSession>;
  }
}

export function normalizeSpreadSession(session: SpreadSession | null) {
  if (!session) {
    return null;
  }

  const spreadDefinition = spreadMap[session.spread.id as keyof typeof spreadMap];

  return {
    ...session,
    cards: session.cards.map((card) => ({
      ...card,
      slotPosition: card.slotPosition ?? {
        x: spreadDefinition?.slots[card.selectionIndex]?.x ?? 0,
        y: spreadDefinition?.slots[card.selectionIndex]?.y ?? 0,
        z: spreadDefinition?.slots[card.selectionIndex]?.z ?? 0
      }
    })),
    persistence: session.persistence ?? {
      provider: 'local',
      cloudBacked: false,
      syncedAt: null
    }
  };
}
