import rawSpreads from './spreads.json';
import type { SpreadDefinition } from '../tarot/types';

export const spreadMap = rawSpreads as typeof rawSpreads;
export const spreadList = Object.values(spreadMap) as SpreadDefinition[];

export type SpreadId = keyof typeof spreadMap;
