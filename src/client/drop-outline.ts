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

/** Shows the outline while a droppable drag is over the page, and hides it when it ends. */
function watchDrags(outline: HTMLElement): void {
  // dragenter and dragleave fire for every element crossed, so count them to know when the drag
  // has really left the window.
  let depth = 0;
  function hide(): void {
    depth = 0;
    outline.setAttribute('hidden', '');
  }
  document.addEventListener('dragenter', (event) => {
    if (isDroppable(event)) {
      depth += 1;
      outline.removeAttribute('hidden');
    }
  });
  document.addEventListener('dragleave', (event) => {
    if (isDroppable(event)) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        hide();
      }
    }
  });
  document.addEventListener('dragover', (event) => {
    if (isDroppable(event)) {
      // Allowing the drop here is what keeps the browser from navigating to the file.
      event.preventDefault();
    }
  });
  document.addEventListener('drop', (event) => {
    if (isDroppable(event)) {
      event.preventDefault();
      hide();
    }
  });
}

const dropOutline = document.querySelector<HTMLElement>('[data-drop-outline]');
if (dropOutline !== null) {
  watchDrags(dropOutline);
}
