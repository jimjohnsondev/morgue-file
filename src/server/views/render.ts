// Turns a Preact element into a complete HTML document string, or a fragment of one.
import { renderToString } from 'preact-render-to-string';

import type { VNode } from 'preact';

/** Renders a page element with the doctype in front. Output is escaped by Preact. */
export function renderDocument(page: VNode): string {
  return `<!DOCTYPE html>${renderToString(page)}`;
}

/** Renders part of a page, such as a notice /events sends to replace one already shown. */
export function renderFragment(part: VNode): string {
  return renderToString(part);
}
