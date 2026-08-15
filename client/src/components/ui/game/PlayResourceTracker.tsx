import { PlayCard } from '@/components/ui/game/PlayCard'
import { twMerge } from 'tailwind-merge'
import chakraCardImage from '@/assets/ChakraCard.webp'
import summonCardImage from '@/assets/SummonCard.webp'
import type { IPlayResourceTrackerProps } from '@/components/ui/types'
import { CardImage } from '@/components/ui/cards/CardImage'

const SMALL_RESOURCE_CARD_SLOTS = 6
const RESOURCE_CARD_FRAME_CLASS = 'h-full max-h-full overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-muted)]'
const RESOURCE_CARD_IMAGE_CLASS = 'h-full w-full rounded-none object-contain p-[1px] [image-rendering:auto] [transform:translateZ(0)]'

export function PlayResourceTracker({ cardClassName, className, reverse = false }: IPlayResourceTrackerProps) {
    const smallResourceCardSlots = Array.from({ length: SMALL_RESOURCE_CARD_SLOTS }, (_, slotIndex) => slotIndex)
    const smallCardFrameClassName = twMerge(
        RESOURCE_CARD_FRAME_CLASS,
        cardClassName,
        'border-transparent',
    )
    const largeCardFrameClassName = twMerge(
        RESOURCE_CARD_FRAME_CLASS,
        cardClassName,
        'border-transparent',
    )

    return (
        <div className={twMerge('grid min-h-0 max-w-[250px] grid-cols-[1fr_auto] gap-px rounded-lg border border-dashed border-[var(--border-subtle)] p-px bg-[var(--surface-elevated)]', className)}>
            <div
                className={twMerge(
                    'grid min-h-0 m-1 grid-rows-2 gap-px rounded-lg p-px bg-[var(--surface-elevated)]',
                    reverse ? 'order-2' : 'order-1',
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
                    {smallResourceCardSlots.slice(4).map((slotIndex) => (
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

            <div className={twMerge('grid min-h-0 w-fit place-items-center justify-self-center', reverse ? 'order-1' : 'order-2')}>
                <PlayCard className={largeCardFrameClassName}>
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
