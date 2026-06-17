/**
 * Shared cloud-rotation accumulator.
 *
 * The Earth surface (shadow sampler) and the cloud shell both advance/read this single angle so
 * their spin — and therefore the shadows the clouds cast — stays perfectly in sync. The rate
 * changes with the camera mode: very slow when idle/overview, faster when locked onto a node so
 * the motion is actually visible up close. Advancing is guarded per animation frame (keyed on the
 * shared clock time) so multiple callers in the same frame don't double-step the angle.
 */

/** rad/s when not locked on a node — gentle drift (~26 min per full rotation). */
const IDLE_SPIN_RATE = 0.004;
/** rad/s when focused on a node — fast enough to read as live motion at close range. */
const FOCUSED_SPIN_RATE = 0.05;

const state = { angle: 0, lastTick: -1 };

export function advanceCloudSpin(
  elapsedTime: number,
  delta: number,
  focused: boolean,
  reducedMotion: boolean,
): number {
  if (elapsedTime !== state.lastTick) {
    state.lastTick = elapsedTime;
    if (!reducedMotion) {
      state.angle += delta * (focused ? FOCUSED_SPIN_RATE : IDLE_SPIN_RATE);
    }
  }
  return state.angle;
}
