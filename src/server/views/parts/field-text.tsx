// A field value shown as text, the same on Item pages and model profiles (R11, R14).
import { formatLinkText } from '../format.js';

import type { FieldType } from '#core/db/repositories/fields.js';

/** A field's value as its type reads: links link, empty values say "none". */
export function FieldText(props: { readonly type: FieldType; readonly text: string | undefined }) {
  const { type, text } = props;
  if (text === undefined) {
    return <span class="caption">none</span>;
  }
  // Only web addresses become links, so a stored value can never run script when clicked.
  const isWebLink = type === 'link' && /^https?:\/\//i.test(text);
  return isWebLink ? <a href={text}>{formatLinkText(text)}</a> : <>{text}</>;
}
