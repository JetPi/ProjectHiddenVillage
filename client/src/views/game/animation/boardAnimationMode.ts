/**
 * Board-animation engine selection.
 *
 * `legacy` is the WAAPI + ghost-effect engine being retired; `motion` is the Motion + director board.
 * The migration runs the two side by side, so this flag is a first-class switch rather than a build-time
 * constant: it defaults from `VITE_BOARD_ANIMATION_MODE` (unset or anything but `motion` = `legacy`) and
 * can be overridden at runtime through the `gameUIStore` slice while the stages land.
 */

type BoardAnimationMode = 'legacy' | 'motion'

const BOARD_ANIMATION_MODE_ENV_VARIABLE = 'VITE_BOARD_ANIMATION_MODE'

/** The mode a fresh session starts in, from the build environment. */
function resolveEnvBoardAnimationMode(): BoardAnimationMode {
  return import.meta.env[BOARD_ANIMATION_MODE_ENV_VARIABLE] === 'motion' ? 'motion' : 'legacy'
}

function isMotionBoardAnimationEnabled(mode: BoardAnimationMode): boolean {
  return mode === 'motion'
}

export type { BoardAnimationMode }
export { resolveEnvBoardAnimationMode, isMotionBoardAnimationEnabled }
