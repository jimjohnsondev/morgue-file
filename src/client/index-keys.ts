// An Index page's keys (R18): ← and → turn its pages, through the pager's Prev and Next. They are
// off while items are being selected, since the selection is per page and a stray key press would
// drop it.
import { followKeyLink, onPageKeys } from './keys.js';

const isIndexPage =
  document.querySelector('.item-page') === null && document.querySelector('.pager') !== null;
const isSelecting = document.querySelector('[data-selection-panel]') !== null;

if (isIndexPage && !isSelecting) {
  onPageKeys({
    ArrowLeft: () => {
      followKeyLink('previous');
    },
    ArrowRight: () => {
      followKeyLink('next');
    },
  });
}
