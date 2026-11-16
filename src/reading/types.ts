import type { SpreadId } from '../config/spreads';

export type ReadingCategory = 'application' | 'study' | 'career' | 'phd' | 'relationships' | 'general';
export type ReadingStatus = 'routed' | 'drawing' | 'drawn' | 'interpreting' | 'completed' | 'interpretation_failed';

export interface ReadingBackground {
  stage: string;
  region: string;
  timeframe: string;
  concern: string;
  context: string;
}

export interface ReadingSession {
  version: 'auratarot.reading.v1';
  id: string;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  status: ReadingStatus;
  question: string;
  category: ReadingCategory;
  background: ReadingBackground;
  routing: {
    spreadId: SpreadId;
    reason: string;
    source: 'rules' | 'ai';
    selectedByUser: boolean;
  };
  spreadResultId: string | null;
  interpretation: null | {
    overallMessage: string;
    publicSummary: string;
    cardReadings: Array<{ slotId: string; text: string }>;
    actions: string[];
    reflectionQuestions: string[];
    modelId: string;
    generatedAt: string;
  };
  sharing: {
    showQuestion: boolean;
    showBackground: boolean;
    showCardReadings: boolean;
    showReflectionQuestions: boolean;
  };
}
