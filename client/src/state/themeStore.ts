import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark'

type ThemeStoreState = {
  theme: ThemeMode
  initialized: boolean
  initializeTheme: () => void
  setTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme
}

function getSystemTheme(): ThemeMode {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const useThemeStore = create<ThemeStoreState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      initialized: false,
      initializeTheme: () => {
        if (get().initialized) {
          return
        }

        const theme = get().theme || getSystemTheme()
        applyTheme(theme)
        set({ theme, initialized: true })
      },
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme, initialized: true })
      },
      toggleTheme: () => {
        const nextTheme: ThemeMode = get().theme === 'dark' ? 'light' : 'dark'
        applyTheme(nextTheme)
        set({ theme: nextTheme, initialized: true })
      },
    }),
    {
      name: 'phv-theme',
      partialize: (state) => ({ theme: state.theme }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return
        }

        const restoredTheme = state.theme || getSystemTheme()
        state.theme = restoredTheme
        state.initialized = true
        applyTheme(restoredTheme)
      },
    },
  ),
)