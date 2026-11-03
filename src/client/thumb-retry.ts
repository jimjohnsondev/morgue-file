// Retries thumbnails that came back as the 1×1 placeholder because they weren't made yet. The
// server has moved their jobs to the front of the queue, so a few tries a moment apart find them.

const RETRY_DELAY_MS = 1500;
const MAX_TRIES = 8;

/** Asks for the image again with a try counter, so the browser doesn't reuse the placeholder. */
function retry(image: HTMLImageElement, tries: number): void {
  const url = new URL(image.src);
  url.searchParams.set('try', String(tries));
  image.dataset.tries = String(tries);
  image.src = url.toString();
}

/** Schedules a retry for an image that loaded as the placeholder. */
function retryIfPlaceholder(image: HTMLImageElement): void {
  const tries = Number(image.dataset.tries ?? '0');
  if (image.naturalWidth !== 1 || tries >= MAX_TRIES) {
    return;
  }
  setTimeout(() => {
    retry(image, tries + 1);
  }, RETRY_DELAY_MS);
}

for (const image of document.querySelectorAll<HTMLImageElement>('img[data-thumb]')) {
  image.addEventListener('load', () => {
    retryIfPlaceholder(image);
  });
  if (image.complete) {
    retryIfPlaceholder(image);
  }
}
