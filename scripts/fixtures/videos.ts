// The 186 videos: 140 pose sessions and 46 timelapses, as short test clips.
import { type FixtureFile, minutesAfter, padNumber } from './fixture-file.ts';

const POSES = ['seated', 'standing', 'reclining', 'twisting'] as const;
const SESSION_COUNT = 35;
const TIMELAPSE_COUNT = 46;
const CLIP = { width: 640, height: 360, fps: 30, durationSeconds: 2 } as const;

/** Frame 7's video is made at its real size and length, so its timecodes and loop range fit. */
const FRAME_7_VIDEO = 'pose_session_04_seated.mp4';
const FRAME_7_CLIP = { width: 1920, height: 1080, fps: 30, durationSeconds: 195 } as const;

/** Every planned video. */
export function planVideos(): FixtureFile[] {
  return [...planPoses(), ...planTimelapses()];
}

/** pose_session_01_seated.mp4 to pose_session_35_twisting.mp4, one session a day. */
function planPoses(): FixtureFile[] {
  const videos: FixtureFile[] = [];
  for (let session = 1; session <= SESSION_COUNT; session++) {
    for (const [poseIndex, pose] of POSES.entries()) {
      const name = `pose_session_${padNumber(session, 2)}_${pose}.mp4`;
      videos.push({
        relPath: `Video/Poses/${name}`,
        kind: 'video',
        mtimeMs: minutesAfter('2024-03-14', session * 1440 + poseIndex * 30),
        ...(name === FRAME_7_VIDEO ? FRAME_7_CLIP : CLIP),
      });
    }
  }
  return videos;
}

/** timelapse_001 to timelapse_046; the even ones are MOV, so both P0 video formats exist. */
function planTimelapses(): FixtureFile[] {
  const videos: FixtureFile[] = [];
  for (let number = 1; number <= TIMELAPSE_COUNT; number++) {
    const extension = number % 2 === 0 ? 'mov' : 'mp4';
    videos.push({
      relPath: `Video/Timelapses/timelapse_${padNumber(number, 3)}.${extension}`,
      kind: 'video',
      mtimeMs: minutesAfter('2024-09-01', number * 2880),
      ...CLIP,
    });
  }
  return videos;
}
