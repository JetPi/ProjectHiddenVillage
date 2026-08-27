import { PlayCard } from '@/components/ui/game/PlayCard'
import { twMerge } from 'tailwind-merge'
import chakraCardImage from '@/assets/ChakraCard.webp'
import summonCardImage from '@/assets/SummonCard.webp'
import type { IPlayResourceTrackerProps } from '@/components/ui/types'
import { CardImage } from '@/components/ui/cards/CardImage'

const SMALL_RESOURCE_CARD_SLOTS = 5
const RESOURCE_CARD_FRAME_CLASS = 'h-full max-h-full overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-muted)]'
const RESOURCE_CARD_IMAGE_CLASS = 'h-full w-full rounded-none object-contain p-[1px] [image-rendering:auto] [transform:translateZ(0)]'
const RESOURCE_CARD_SCALE_CLASS = 'scale-[var(--resource-card-scale)]'

export function PlayResourceTracker({ cardClassName, className, reverse = false, isSummonCardReady = true }: IPlayResourceTrackerProps) {
    const smallResourceCardSlots = Array.from({ length: SMALL_RESOURCE_CARD_SLOTS }, (_, slotIndex) => slotIndex)
    const smallCardFrameClassName = twMerge(
        RESOURCE_CARD_FRAME_CLASS,
        cardClassName,
        'border-transparent transform-gpu origin-center transition-transform duration-300 ease-out will-change-transform',
        RESOURCE_CARD_SCALE_CLASS,
    )
    const largeCardFrameClassName = twMerge(
        RESOURCE_CARD_FRAME_CLASS,
        'border-transparent bg-transparent p-0.5',
    )

    return (
        <div
            className={twMerge(
                'mx-auto flex min-h-0 w-full max-w-[var(--resource-rail-max-width)] min-w-0 gap-0.5 rounded-lg border border-dashed border-[var(--border-subtle)] p-px bg-[var(--surface-elevated)]',
                reverse ? 'flex-row-reverse' : 'flex-row',
                className,
            )}
        >
            <div
                className={twMerge(
                    'grid min-h-0 flex-1 m-0.5 grid-rows-2 gap-px rounded-lg p-px bg-[var(--surface-elevated)]',
                )}
            >
                <div className="flex min-h-0 items-center justify-center gap-0.5">
                    {smallResourceCardSlots.slice(0, 3).map((slotIndex) => (
                        <PlayCard
                            key={`resource-small-top-${slotIndex}`}
                            className={smallCardFrameClassName}
                        >
                            <CardImage
                                src={chakraCardImage}
                                alt="Chakra card"
                                className={RESOURCE_CARD_IMAGE_CLASS}
                            />
                        </PlayCard>
                    ))}
                </div>
                <div className="flex min-h-0 items-center justify-center gap-0.5">
                    {smallResourceCardSlots.slice(3).map((slotIndex) => (
                        <PlayCard
                            key={`resource-small-bottom-${slotIndex}`}
                            className={smallCardFrameClassName}
                        >
                            <CardImage
                                src={chakraCardImage}
                                alt="Chakra card"
                                className={RESOURCE_CARD_IMAGE_CLASS}
                            />
                        </PlayCard>
                    ))}
                </div>
            </div>

            <div className="grid min-h-0 w-[var(--resource-summon-lane-width)] place-items-center px-0.5">
                <PlayCard
                    className={twMerge(
                        largeCardFrameClassName,
                        'transition-transform duration-300 ease-out will-change-transform origin-center',
                        isSummonCardReady ? `rotate-0 ${RESOURCE_CARD_SCALE_CLASS}` : `rotate-90 ${RESOURCE_CARD_SCALE_CLASS}`,
                    )}
                >
                    <CardImage
                        src={summonCardImage}
                        alt="Summon card"
                        className={RESOURCE_CARD_IMAGE_CLASS}
                    />
                </PlayCard>
            </div>
        </div>
    )
}
