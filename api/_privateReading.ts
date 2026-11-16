export interface PrivateBackground {
  stage: string;
  region: string;
  timeframe: string;
  concern: string;
  context: string;
}

export interface PrivateInterpretation {
  overallMessage: string;
  cardReadings: Array<{ slotId: string; text: string }>;
  actions: string[];
  reflectionQuestions: string[];
}

const BACKGROUND_LIMITS: Record<keyof PrivateBackground, number> = {
  stage: 30, region: 60, timeframe: 60, concern: 160, context: 400
};

export function parsePrivateRequest(body: unknown) {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    if (typeof value.sessionId !== 'string' || typeof value.question !== 'string' ||
        !value.background || typeof value.background !== 'object' || Array.isArray(value.background)) return null;
    const question = value.question.trim();
    if (question.length < 8 || question.length > 300) return null;
    const rawBackground = value.background as Record<string, unknown>;
    const background = {} as PrivateBackground;
    for (const [key, limit] of Object.entries(BACKGROUND_LIMITS)) {
      const field = rawBackground[key] ?? '';
      if (typeof field !== 'string' || field.length > limit) return null;
      background[key as keyof PrivateBackground] = field.trim();
    }
    return { sessionId: value.sessionId, question, background };
  } catch { return null; }
}

export function parsePrivateInterpretation(value: unknown, slotIds: string[]): PrivateInterpretation | null {
  if (!value || typeof value !== 'object') return null;
  const result = value as Record<string, unknown>;
  if (typeof result.overallMessage !== 'string' || result.overallMessage.trim().length < 40 ||
      result.overallMessage.length > 600 || !Array.isArray(result.cardReadings) ||
      result.cardReadings.length !== slotIds.length || !Array.isArray(result.actions) ||
      result.actions.length < 2 || result.actions.length > 3 ||
      !Array.isArray(result.reflectionQuestions) || result.reflectionQuestions.length < 1 ||
      result.reflectionQuestions.length > 2) return null;
  const cardReadings: PrivateInterpretation['cardReadings'] = [];
  for (let index = 0; index < slotIds.length; index += 1) {
    const card = result.cardReadings[index];
    if (!card || typeof card !== 'object' || card.slotId !== slotIds[index] ||
        typeof card.text !== 'string' || card.text.trim().length < 12 || card.text.length > 200) return null;
    cardReadings.push({ slotId: slotIds[index], text: card.text.trim() });
  }
  const validList = (list: unknown[], max: number) => list.every((item) =>
    typeof item === 'string' && item.trim().length >= 8 && item.length <= max);
  if (!validList(result.actions, 140) || !validList(result.reflectionQuestions, 140)) return null;
  return {
    overallMessage: result.overallMessage.trim(), cardReadings,
    actions: result.actions.map((item: string) => item.trim()),
    reflectionQuestions: result.reflectionQuestions.map((item: string) => item.trim())
  };
}
