export type IDeckOptionsEntryMode = 'import' | 'saved_decks' | 'starter_decks'

/**
 * The login panel has two tabs. Joining by code and hosting a table are not alternatives to each other - a player
 * either holds a code or wants to open a table - so they share one tab and offer one button each.
 */
export type IGameEntryMode = 'quickmatch' | 'join_or_host'

/** The two actions that need a format. Each keeps its own selection, so saving one never moves the other. */
export type IRulesetMode = 'quickmatch' | 'host'

/** What a submit button asks the view to do, which is finer grained than the tab it sits on. */
export type IGameIntent = 'quickmatch' | 'join' | 'host'
