
export type IHandReorderCard = {
  instanceId: string
}

export type IHandRowReorderProps<TCard> = {
  values: string[]
  onReorder: (values: string[]) => void
  isDraggableCard: (card: TCard) => boolean
  activeValue: string | null
  onDragStateChange: (instanceId: string | null) => void
}
