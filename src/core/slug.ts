// URL slugs for subcategories and models, and search keys for fields.

/**
 * Lowercases a name and joins its words with a separator, keeping letters and digits of any
 * script: accents are dropped ("Études" becomes "etudes") and "李娜" stays "李娜".
 */
export function joinWords(name: string, separator: '-' | '_'): string {
  const words = name
    .normalize('NFKD')
    .replaceAll(/\p{M}/gu, '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  return (words ?? []).join(separator);
}

/** Turns a name into a URL segment: "Elena Varga" becomes "elena-varga". */
export function slugify(name: string): string {
  return joinWords(name, '-');
}
