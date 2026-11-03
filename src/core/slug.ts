// URL slugs for subcategories and models.

/** Turns a name into a URL segment: "Elena Varga" becomes "elena-varga". */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-|-$/g, '');
}
