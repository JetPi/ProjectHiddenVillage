import type { IEffectNoticeResponse } from '@/services/api/gameApi'

/**
 * Notices the server published for the requesting player, oldest first. The banner shows the newest one that
 * had not been announced when the board mounted.
 */
export type IEffectNoticeBannerProps = {
  notices?: readonly IEffectNoticeResponse[] | null
}
