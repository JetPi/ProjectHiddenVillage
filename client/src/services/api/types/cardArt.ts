/** What the admin art upload returns: the reference to send back on the card create request. */
export type ICardArtUploadResult = {
  cardId: string
  /** A `local:` art reference owned by the server. */
  reference: string
  /** Cache-busting token for the freshly stored master. */
  version: number
}
