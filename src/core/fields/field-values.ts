// What each field type accepts, and how a value is stored and read back (R11, R14).
import { AppError } from '#core/errors.js';

import type { Field, StoredValue } from '#core/db/repositories/fields.js';

/** A field value as pages and forms see it: text for most types, a number for numbers. */
export type FieldValue = string | number;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The items' rating runs from 1 to 5 stars, which `rating:n` and the stars of frame 5 read. */
const MAX_RATING = 5;

/**
 * Checks a value against its field's type and returns it in stored form. Forms send numbers as
 * text, so a number field also takes numeric text.
 */
export function toStoredValue(field: Field, value: FieldValue): StoredValue {
  if (field.type === 'number') {
    const number = toNumber(field, value);
    if (isItemRating(field)) {
      requireStars(field, number);
    }
    return { valueText: undefined, valueNum: number };
  }
  const text = String(value).trim();
  if (field.type === 'link') {
    requireLink(field, text);
  } else if (field.type === 'date') {
    requireDate(field, text);
  } else if (field.type === 'picklist' && !field.options.includes(text)) {
    refuse(field, `must be one of: ${field.options.join(', ')}`);
  }
  return { valueText: text, valueNum: undefined };
}

/** Reads a stored value back in the form pages show, or undefined if the row holds nothing. */
export function fromStoredValue(field: Field, stored: StoredValue): FieldValue | undefined {
  return field.type === 'number' ? stored.valueNum : stored.valueText;
}

function toNumber(field: Field, value: FieldValue): number {
  const number = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(number) || (typeof value === 'string' && value.trim() === '')) {
    refuse(field, 'must be a number');
  }
  return number;
}

/** Whether a field is the items' Rating, the one number field drawn as stars (R11). */
function isItemRating(field: Field): boolean {
  return field.entity === 'item' && field.key === 'rating';
}

/** A rating is a whole number of stars from 1 to 5; clearing it means "none". */
function requireStars(field: Field, number: number): void {
  if (!Number.isInteger(number) || number < 1 || number > MAX_RATING) {
    refuse(field, `must be a whole number from 1 to ${String(MAX_RATING)}`);
  }
}

/** Links must be web addresses, so a stored link can never run script when clicked. */
function requireLink(field: Field, text: string): void {
  if (!URL.canParse(text)) {
    refuse(field, 'must be a web address starting with http:// or https://');
  }
  const protocol = new URL(text).protocol;
  if (protocol !== 'http:' && protocol !== 'https:') {
    refuse(field, 'must be a web address starting with http:// or https://');
  }
}

/** Dates are stored as YYYY-MM-DD, so they sort and group by year as text. */
function requireDate(field: Field, text: string): void {
  const time = ISO_DATE.test(text) ? Date.parse(text) : Number.NaN;
  // Date.parse rolls 2021-02-30 over to March, so the date must also read back unchanged.
  const isRealDate = !Number.isNaN(time) && new Date(time).toISOString().startsWith(text);
  if (!isRealDate) {
    refuse(field, 'must be a date written as YYYY-MM-DD');
  }
}

function refuse(field: Field, reason: string): never {
  throw new AppError('invalid-input', `${field.label} ${reason}.`);
}
