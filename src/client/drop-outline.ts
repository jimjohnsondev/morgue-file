// Shows the drop outline while a file or a browser image is dragged over any page (E6), and
// stops the browser from opening a dropped file in place of the archive. Saving the drop to the
// Inbox and showing "Saved to Unsorted" comes with ingest (PR 12).

/** What a drag can carry that ingest will take: files, or an address dragged from a browser. */
const DROPPABLE_TYPES = ['Files', 'text/uri-list'];

/** Says whether a drag carries something worth dropping, rather than text being moved. */
function isDroppable(event: DragEvent): boolean {
  const types = event.dataTransfer?.types ?? [];
  return DROPPABLE_TYPES.some((type) => types.includes(type));
}

/**
 * Tracks drags that start on the page itself: a thumbnail or link dragged within the page
 * carries its address too, and that isn't a drop. Returns whether one is under way.
 */
function watchPageDrags(): () => boolean {
  let isDragging = false;
  document.addEventListener('dragstart', () => {
    isDragging = true;
  });
  // A dragged element removed mid-drag may never send dragend, so a drop ends it too.
  for (const ending of ['dragend', 'drop']) {
    document.addEventListener(ending, () => {
      isDragging = false;
    });
  }
  return () => isDragging;
}

/** Shows the outline while a droppable drag is over the page, and hides it when it ends. */
function watchDrags(outline: HTMLElement): void {
  // dragenter and dragleave fire for every element crossed, so count them to know when the drag
  // has really left the window.
  let depth = 0;
  const isDragFromPage = watchPageDrags();
  function isDropFromOutside(event: DragEvent): boolean {
    return !isDragFromPage() && isDroppable(event);
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
    if (isDropFromOutside(event)) {
      event.preventDefault();
      hide();
    }
  });
}

const dropOutline = document.querySelector<HTMLElement>('[data-drop-outline]');
if (dropOutline !== null) {
  watchDrags(dropOutline);
}
