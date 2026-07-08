import { ValueTransformer } from 'typeorm';

/**
 * Postgres `numeric`/`decimal` columns are returned by the pg driver as
 * strings (to avoid silent precision loss), but TypeORM does not convert
 * them back to `number` automatically. Apply this to every decimal column
 * so the JS type matches the entity's declared `number` type.
 */
export const DecimalColumnTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : parseFloat(value)),
};
