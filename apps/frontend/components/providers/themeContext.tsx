'use client'
import { useContext, useEffect, useState } from 'react'
import React from 'react'
import '@/lib/zod/setup'

export type ThemePreference = 'dark' | 'light' | 'system'

type ContextType = {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

type Props = {
  children: React.ReactNode
}

const Theme = React.createContext<ContextType>({} as ContextType)

const applyThemePreference = (preference: ThemePreference) => {
  if (typeof window === 'undefined') return
  const useDark =
    preference === 'dark' ||
    (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', useDark)
}

const ThemeProvider: React.FC<Props> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemePreference>('system')

  useEffect(() => {
    const stored = window.localStorage.getItem('logicle-theme') as ThemePreference | null
    const initial = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
    setThemeState(initial)
    applyThemePreference(initial)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onSystemThemeChange = () => {
      if ((window.localStorage.getItem('logicle-theme') ?? 'system') === 'system') {
        applyThemePreference('system')
      }
    }

    media.addEventListener('change', onSystemThemeChange)
    return () => media.removeEventListener('change', onSystemThemeChange)
  }, [])

  const setTheme = (next: ThemePreference) => {
    window.localStorage.setItem('logicle-theme', next)
    setThemeState(next)
    applyThemePreference(next)
  }

  return <Theme.Provider value={{ theme, setTheme }}>{children}</Theme.Provider>
}

const useTheme = (): ContextType => useContext(Theme)

export { useTheme }

export default ThemeProvider
