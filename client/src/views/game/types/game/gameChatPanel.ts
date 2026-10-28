/**
 * The chat panel reads its own data (the chat store) and its own open state (the UI store), so the board only has
 * to tell it who is playing and how to send.
 */
export type IGameChatPanelProps = {
  authUserId?: string
  isConnected: boolean
  onSendMessage: (text: string) => Promise<boolean>
}
