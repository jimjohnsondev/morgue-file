// Frame-exact video tools (build plan row 22, R20): frame-step moves one frame at a time from the
// frame on show, on MP4 and MOV, and a loop range plays only the frames between its in and out
// points. The fixture videos are 30 fps, so the frame the browser shows is its media time × 30.
import { expect, test } from '../support/shared-server-test.js';

import type { Page } from '@playwright/test';

/** The fixture videos' frame rate. */
const FPS = 30;

/** A record of every frame the browser shows, kept on the page for the test to read. */
type FrameRecord = { shownFrames: number[] };

/** Opens a video from its Index page, once its thumbnail job has measured its frame rate. */
async function openVideo(page: Page, indexUrl: string, label: string): Promise<void> {
  await page.goto(indexUrl);
  await page.locator('.thumb-card', { hasText: label }).locator('a').first().click();
  const details = page.getByRole('complementary', { name: 'Details' });
  await expect(async () => {
    await page.reload();
    await expect(details).toContainText('30 fps', { timeout: 1000 });
  }).toPass({ timeout: 120_000 });
}

/** Starts recording, in the page, the number of every frame the browser shows from now on. */
async function recordShownFrames(page: Page): Promise<void> {
  await page.locator('[data-video-player]').evaluate((video: HTMLVideoElement, fps: number) => {
    const record = window as unknown as FrameRecord;
    record.shownFrames = [];
    function onFrame(_now: number, metadata: VideoFrameCallbackMetadata): void {
      record.shownFrames.push(Math.round(metadata.mediaTime * fps));
      video.requestVideoFrameCallback(onFrame);
    }
    video.requestVideoFrameCallback(onFrame);
  }, FPS);
}

/** The frames the browser has shown since recording started. */
async function shownFrames(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as FrameRecord).shownFrames);
}

/** Expects the browser to be showing this frame, and the player to say so. */
async function expectFrameOnShow(page: Page, frame: number): Promise<void> {
  await expect(page.locator('[data-video-text="frame"]')).toHaveText(
    `frame ${frame.toLocaleString('en-US')}`,
  );
  await expect.poll(async () => (await shownFrames(page)).at(-1)).toBe(frame);
}

for (const { format, indexUrl, label } of [
  { format: 'MP4', indexUrl: '/video/poses', label: 'pose_session_04_seated.mp4' },
  { format: 'MOV', indexUrl: '/video/timelapses', label: 'timelapse_002.mov' },
]) {
  test(`R20: frame-step shows the exact next and previous frame on ${format}`, async ({ page }) => {
    await openVideo(page, indexUrl, label);
    await recordShownFrames(page);
    await page.locator('[data-video-scrub]').fill('1');
    await expectFrameOnShow(page, 30);
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('.');
    }
    await expectFrameOnShow(page, 35);
    await page.getByRole('button', { name: '‹ Frame' }).click();
    await page.keyboard.press(',');
    await expectFrameOnShow(page, 33);
    await expect(page.locator('[data-video-text="time"]')).toContainText('0:01.10 /');
  });
}

test('R20: a loop range plays only the frames from its in point to its out point', async ({
  page,
}) => {
  await openVideo(page, '/video/timelapses', 'timelapse_002.mov');
  await page.locator('[data-video-scrub]').fill('0.34');
  await page.keyboard.press('i');
  await expect(page.locator('[data-video-text="loop-in"]')).toHaveText('0:00.33');
  await page.locator('[data-video-scrub]').fill('0.68');
  await page.keyboard.press('o');
  await expect(page.locator('[data-video-text="loop-out"]')).toHaveText('0:00.66');
  await page.getByRole('button', { name: 'Loop off' }).click();
  await recordShownFrames(page);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => (await shownFrames(page)).filter((frame) => frame === 20).length, {
      timeout: 10_000,
    })
    .toBeGreaterThanOrEqual(3);
  await page.getByRole('button', { name: '❚❚ Pause' }).click();
  const frames = await shownFrames(page);
  expect(frames).toContain(10);
  expect(frames.filter((frame) => frame < 10 || frame > 20)).toEqual([]);
});
