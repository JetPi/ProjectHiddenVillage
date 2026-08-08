import { PlayCard } from './PlayCard'
import { twMerge } from 'tailwind-merge'
import { CardImage } from './CardImage'
import chakraCardImage from '../../assets/ChakraCard.webp'
import summonCardImage from '../../assets/SummonCard.webp'

const SMALL_RESOURCE_CARD_SLOTS = 6
const RESOURCE_CARD_FRAME_CLASS = 'h-full max-h-full overflow-hidden rounded-sm border border-[var(--border-subtle)] bg-[var(--surface-muted)]'
const RESOURCE_CARD_IMAGE_CLASS = 'h-full w-full rounded-none object-contain p-[1px] [image-rendering:auto] [transform:translateZ(0)]'

type PlayResourceTrackerProps = {
    cardClassName: string
    className?: string
    reverse?: boolean
}

export function PlayResourceTracker({ cardClassName, className, reverse = false }: PlayResourceTrackerProps) {
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
        <div className={twMerge('grid min-h-0 grid-cols-2 gap-px rounded-lg border border-dashed border-[var(--border-subtle)] p-px bg-[var(--surface-elevated)]', className)}>
            <div
                className={twMerge(
                    'grid min-h-0 grid-rows-2 gap-px rounded-lg p-px bg-[var(--surface-elevated)]',
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

            <div className={twMerge('grid min-h-0 place-items-center', reverse ? 'order-1' : 'order-2')}>
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
