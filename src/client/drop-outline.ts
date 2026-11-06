// Shows the drop outline while a file or a browser image is dragged over any page (E6), stops
// the browser from opening a dropped file in place of the archive, and saves the drop to the
// Inbox (R2, through ingest-upload.ts).
import { readTransfer, saveToInbox } from './ingest-upload.js';

/** What a drag can carry that ingest will take: files, or an address dragged from a browser. */
const DROPPABLE_TYPES = ['Files', 'text/uri-list'];

/** Says whether a drag carries something worth dropping, rather than text being moved. */
function isDroppable(event: DragEvent): boolean {
  const types = event.dataTransfer?.types ?? [];
  return DROPPABLE_TYPES.some((type) => types.includes(type));
}

/** Whether a drag that started on the page itself is under way, and how to end it. */
type PageDrags = { readonly isUnderWay: () => boolean; readonly end: () => void };

/**
 * Tracks drags that start on the page itself: a thumbnail or link dragged within the page
 * carries its address too, and that isn't a drop to save.
 */
function watchPageDrags(): PageDrags {
  let isDragging = false;
  document.addEventListener('dragstart', () => {
    isDragging = true;
  });
  document.addEventListener('dragend', () => {
    isDragging = false;
  });
  // A dragged element removed mid-drag may never send dragend, so the drop handler ends it too,
  // once it has checked where the drag came from.
  return {
    isUnderWay: () => isDragging,
    end: () => {
      isDragging = false;
    },
  };
}

/** Shows the outline while a droppable drag is over the page, and hides it when it ends. */
function watchDrags(outline: HTMLElement): void {
  // dragenter and dragleave fire for every element crossed, so count them to know when the drag
  // has really left the window.
  let depth = 0;
  const pageDrags = watchPageDrags();
  function isDropFromOutside(event: DragEvent): boolean {
    return !pageDrags.isUnderWay() && isDroppable(event);
  }
  function hide(): void {
    depth = 0;
    outline.setAttribute('hidden', '');
  }
  document.addEventListener('dragenter', (event) => {
    if (isDropFromOutside(event)) {
      depth += 1;
      outline.removeAttribute('hidden');
    }
  });
  document.addEventListener('dragleave', (event) => {
    if (isDropFromOutside(event)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        hide();
      }
    }
  });
  document.addEventListener('dragover', (event) => {
    if (isDropFromOutside(event)) {
      // Allowing the drop here is what keeps the browser from navigating to the file.
      event.preventDefault();
    }
  });
  document.addEventListener('drop', (event) => {
    const isFromOutside = isDropFromOutside(event);
    pageDrags.end();
    if (isFromOutside && event.dataTransfer !== null) {
      event.preventDefault();
      hide();
      // Read now: the browser empties the drop's data once this handler returns.
      void saveToInbox(readTransfer(event.dataTransfer));
    }
  });
}

const dropOutline = document.querySelector<HTMLElement>('[data-drop-outline]');
if (dropOutline !== null) {
  watchDrags(dropOutline);
}
