// Records the viewing history Home's first strip shows (R35): when an Item page opens, the item
// and the page on show or the video time it starts at; then, for a video, the time reached each
// time it pauses and when the page is left. The server keeps one entry per opening.
import { sendToApi } from './api-request.js';

/** Sends one view; a history that can't be saved isn't worth interrupting the viewer for. */
function recordView(url: string, view: { position?: number; isSentOnLeaving: boolean }): void {
  const body = view.position === undefined ? {} : { position: view.position };
  void sendToApi(url, { method: 'POST', body, isSentOnLeaving: view.isSentOnLeaving });
}

/** Records the time a video has reached when it pauses, and when the page is left. */
function followVideoTime(url: string, video: HTMLVideoElement): void {
  video.addEventListener('pause', () => {
    recordView(url, { position: video.currentTime, isSentOnLeaving: false });
  });
  window.addEventListener('pagehide', () => {
    recordView(url, { position: video.currentTime, isSentOnLeaving: true });
  });
}

const itemPage = document.querySelector<HTMLElement>('[data-history-item]');
if (itemPage !== null) {
  const url = `/api/items/${itemPage.dataset.historyItem ?? ''}/view`;
  const opened = itemPage.dataset.historyPosition;
  recordView(url, {
    ...(opened === undefined ? {} : { position: Number(opened) }),
    isSentOnLeaving: false,
  });
  const video = document.querySelector<HTMLVideoElement>('[data-video-player]');
  if (video !== null) {
    followVideoTime(url, video);
  }
}
