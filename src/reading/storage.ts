import type { SpreadId } from '../config/spreads';
import { routeQuestion, type RoutingDecision } from './routing';
import type { ReadingBackground, ReadingSession } from './types';

const STORAGE_KEY = 'auratarot.private.readings.v1';

export function createReadingSession(question: string, background: ReadingBackground, ownerId: string,
  aiRoute?: RoutingDecision | null): ReadingSession {
  const now = new Date().toISOString();
  const route = aiRoute ?? routeQuestion(question);
  return {
    version: 'auratarot.reading.v1', id: crypto.randomUUID(), createdAt: now, updatedAt: now,
    ownerId, status: 'routed', question: question.trim(), category: route.category, background,
    routing: { spreadId: route.spreadId, reason: route.reason,
      source: aiRoute ? 'ai' : 'rules', selectedByUser: false },
    spreadResultId: null, interpretation: null,
    sharing: { showQuestion: false, showBackground: false, showCardReadings: false, showReflectionQuestions: false }
  };
}

function allReadings(): Record<string, ReadingSession> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, ReadingSession>;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

export function saveReadingSession(session: ReadingSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...allReadings(), [session.id]: session }));
  } catch { /* Private browsing can disallow storage. */ }
}

export function loadReadingSession(id: string): ReadingSession | null {
  const session = allReadings()[id];
  return session?.version === 'auratarot.reading.v1' ? session : null;
}

export function findReadingBySpreadResult(resultId: string): ReadingSession | null {
  return Object.values(allReadings()).find((session) => session.version === 'auratarot.reading.v1' && session.spreadResultId === resultId) ?? null;
}

export function removeReadingBySpreadResult(resultId: string) {
  try {
    const readings = allReadings();
    for (const [id, session] of Object.entries(readings)) {
      if (session.spreadResultId === resultId) delete readings[id];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readings));
  } catch { /* Private browsing may disallow storage. */ }
}

export function updateReadingSpread(session: ReadingSession, spreadId: SpreadId): ReadingSession {
  const next: ReadingSession = { ...session, updatedAt: new Date().toISOString(),
    routing: { ...session.routing, spreadId,
      reason: spreadId === session.routing.spreadId ? session.routing.reason : '你已手动选择此牌阵。',
      selectedByUser: spreadId !== session.routing.spreadId || session.routing.selectedByUser } };
  saveReadingSession(next);
  return next;
}

export function attachSpreadResult(session: ReadingSession, resultId: string) {
  saveReadingSession({ ...session, status: 'drawn', updatedAt: new Date().toISOString(), spreadResultId: resultId });
}
