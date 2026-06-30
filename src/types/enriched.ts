import type { Terminverwaltung } from './app';

export type EnrichedTerminverwaltung = Terminverwaltung & {
  kundeName: string;
  monteurName: string;
};
