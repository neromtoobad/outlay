import { researchBrief } from './research-brief.ts';
import { localBusinessFinder } from './local-business-finder.ts';
import { leadList } from './lead-list.ts';

export const SERVICES = {
  [researchBrief.id]: researchBrief,
  [localBusinessFinder.id]: localBusinessFinder,
  [leadList.id]: leadList,
} as const;
