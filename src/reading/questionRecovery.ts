import type { ReadingBackground } from './types';

const PENDING_KEY = 'auratarot.question.pending.v1';
const HANDOFF_KEY = 'auratarot.question.handoff.v1';
// A draft can outlive an email link; authentication is still required to recover it.
const RECOVERY_LIFETIME_MS = 24 * 60 * 60 * 1000;
const backgroundKeys = ['stage', 'region', 'timeframe', 'concern', 'context'] as const;

export interface PendingQuestion {
  question: string;
  background: ReadingBackground;
  email?: string;
  phone?: string;
  createdAt: number;
}

export interface QuestionHandoff {
  pending: PendingQuestion;
  ownerId: string;
  readingId: string;
}

export function normalizeBackground(value: Partial<ReadingBackground> = {}): ReadingBackground {
  return Object.fromEntries(backgroundKeys.map((key) => [key,
    typeof value?.[key] === 'string' ? value[key] : ''
  ])) as unknown as ReadingBackground;
}

export function sameQuestion(a: { question: string; background: Partial<ReadingBackground> },
  b: { question: string; background: Partial<ReadingBackground> }) {
  return a.question.trim() === b.question.trim() && backgroundKeys.every((key) =>
    (a.background?.[key] ?? '') === (b.background?.[key] ?? ''));
}

export function samePending(a: PendingQuestion, b: PendingQuestion) {
  return a.createdAt === b.createdAt && a.email === b.email && a.phone === b.phone && sameQuestion(a, b);
}

export function matchesPendingIdentity(pending: PendingQuestion,
  user: { email?: string; phone?: string }) {
  return Boolean(pending.email && pending.email === user.email?.trim().toLowerCase() ||
    pending.phone && pending.phone === user.phone);
}

function isValidPending(value: unknown): value is PendingQuestion {
  if (!value || typeof value !== 'object') return false;
  const pending = value as PendingQuestion;
  return typeof pending.question === 'string' && pending.question.trim().length >= 8 &&
    pending.question.trim().length <= 300 && !!pending.background && typeof pending.background === 'object' &&
    !Array.isArray(pending.background) &&
    backgroundKeys.every((key) => pending.background[key] === undefined || typeof pending.background[key] === 'string') &&
    Boolean(typeof pending.email === 'string' && pending.email || typeof pending.phone === 'string' && pending.phone) &&
    Number.isFinite(pending.createdAt) && pending.createdAt <= Date.now() &&
    Date.now() - pending.createdAt <= RECOVERY_LIFETIME_MS;
}

export function readPendingQuestion(): PendingQuestion | null {
  try {
    const pending: unknown = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null');
    if (isValidPending(pending)) return pending;
    localStorage.removeItem(PENDING_KEY);
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export function savePendingQuestion(pending: PendingQuestion): boolean {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    return true;
  } catch { return false; }
}

export function clearPendingQuestion(expected: PendingQuestion) {
  try {
    const current = readPendingQuestion();
    if (current && samePending(current, expected)) localStorage.removeItem(PENDING_KEY);
  } catch { /* Keep the draft if storage is unavailable. */ }
}

export function readQuestionHandoff(): QuestionHandoff | null {
  try {
    const handoff = JSON.parse(localStorage.getItem(HANDOFF_KEY) ?? 'null') as QuestionHandoff | null;
    if (handoff && isValidPending(handoff.pending) && typeof handoff.ownerId === 'string' && handoff.ownerId &&
      typeof handoff.readingId === 'string' && handoff.readingId) return handoff;
    localStorage.removeItem(HANDOFF_KEY);
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export function saveQuestionHandoff(handoff: QuestionHandoff): boolean {
  try {
    const current = readQuestionHandoff();
    if (current && current.pending.createdAt > handoff.pending.createdAt) return false;
    localStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
    return true;
  } catch { return false; }
}
