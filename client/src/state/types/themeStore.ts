export type IThemeMode = 'light' | 'dark'

export type IThemeStoreState = {
  theme: IThemeMode
  initialized: boolean
  initializeTheme: () => void
  setTheme: (theme: IThemeMode) => void
  toggleTheme: () => void
}
