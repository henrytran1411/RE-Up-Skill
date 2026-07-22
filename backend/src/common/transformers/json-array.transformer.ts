import { ValueTransformer } from 'typeorm';

/**
 * Stores an array as JSON in a `text` column and reads it back as a real
 * array — always `[]` when the column is null/empty, never `null`, so
 * entity properties using this can be typed as a plain array (no `| null`).
 */
export const JsonArrayColumnTransformer: ValueTransformer = {
  to: (value?: unknown[] | null) => (value && value.length > 0 ? JSON.stringify(value) : null),
  from: (value?: string | null) => (value ? JSON.parse(value) : []),
};
