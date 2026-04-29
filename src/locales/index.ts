import { en } from './en';
import { da } from './da';

export type Lang = 'en' | 'da';

export const dictionaries = { en, da } as const;

export type { TranslationKey } from './en';
