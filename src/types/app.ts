// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Terminverwaltung {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    termin_datum?: string; // Format: YYYY-MM-DD oder ISO String
    auftragsart?: LookupValue;
    kunde?: string; // applookup -> URL zu 'Kundenverwaltung' Record
    monteur?: string; // applookup -> URL zu 'Monteurdaten' Record
    beschreibung?: string;
    erledigt?: boolean;
  };
}

export interface Kundenverwaltung {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    vorname?: string;
    nachname?: string;
    telefon?: string;
    email?: string;
    strasse?: string;
    hausnummer?: string;
    plz?: string;
    ort?: string;
    standort?: GeoLocation; // { lat, long, info }
  };
}

export interface Monteurdaten {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    monteur_vorname?: string;
    monteur_nachname?: string;
    monteur_telefon?: string;
    monteur_notiz?: string;
  };
}

export const APP_IDS = {
  TERMINVERWALTUNG: '6a438b105067be8e61ede88a',
  KUNDENVERWALTUNG: '6a438b0adf0702ab92fe4ca1',
  MONTEURDATEN: '6a438b0f0996cd2d134c788a',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'terminverwaltung': {
    auftragsart: [{ key: "wartung", label: "Wartung" }, { key: "reparatur", label: "Reparatur" }, { key: "notdienst", label: "Notdienst" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'terminverwaltung': {
    'termin_datum': 'date/datetimeminute',
    'auftragsart': 'lookup/radio',
    'kunde': 'applookup/select',
    'monteur': 'applookup/select',
    'beschreibung': 'string/textarea',
    'erledigt': 'bool',
  },
  'kundenverwaltung': {
    'vorname': 'string/text',
    'nachname': 'string/text',
    'telefon': 'string/tel',
    'email': 'string/email',
    'strasse': 'string/text',
    'hausnummer': 'string/text',
    'plz': 'string/text',
    'ort': 'string/text',
    'standort': 'geo',
  },
  'monteurdaten': {
    'monteur_vorname': 'string/text',
    'monteur_nachname': 'string/text',
    'monteur_telefon': 'string/tel',
    'monteur_notiz': 'string/text',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateTerminverwaltung = StripLookup<Terminverwaltung['fields']>;
export type CreateKundenverwaltung = StripLookup<Kundenverwaltung['fields']>;
export type CreateMonteurdaten = StripLookup<Monteurdaten['fields']>;