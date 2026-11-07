// The words of a file's name, as its search row holds them (docs/ARCHITECTURE.md, Search tables).
// The tokenizer already splits on `_`, `-` and `.`; camelCase is split here, so "seatedBacklit"
// is found by "backlit" as "seated_backlit_017.jpg" is.

/**
 * The last part of a stored path, split into words on `_`, `-`, `.` and camelCase:
 * `Figure/seatedBacklit_017.jpg` → `seated Backlit 017 jpg`.
 */
export function nameWords(relPath: string): string {
  const name = relPath.slice(relPath.lastIndexOf('/') + 1);
  return name
    .replaceAll(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replaceAll(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
    .replaceAll(/[_\-.\s]+/g, ' ')
    .trim();
}
