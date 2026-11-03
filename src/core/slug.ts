// URL slugs for subcategories and models, and search keys for fields.

/**
 * Lowercases a name and joins its words with a separator, keeping letters and digits of any
 * script. Accents on Latin letters are dropped ("Études" becomes "etudes"); marks in other
 * scripts are part of the letter (ガ, Hangul syllables), so they stay.
 */
export function joinWords(name: string, separator: '-' | '_'): string {
  const words = name
    .normalize('NFKD')
    .replaceAll(/(\p{Script=Latin})\p{M}+/gu, '$1')
    .normalize('NFC')
    .toLowerCase()
    .match(/[\p{L}\p{M}\p{N}]+/gu);
  return (words ?? []).join(separator);
}

/** Turns a name into a URL segment: "Elena Varga" becomes "elena-varga". */
export function slugify(name: string): string {
  return joinWords(name, '-');
}
