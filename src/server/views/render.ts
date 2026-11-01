// Turns a Preact element into a complete HTML document string.
import { renderToString } from 'preact-render-to-string';

import type { VNode } from 'preact';

/** Renders a page element with the doctype in front. Output is escaped by Preact. */
export function renderDocument(page: VNode): string {
  return `<!DOCTYPE html>${renderToString(page)}`;
}
