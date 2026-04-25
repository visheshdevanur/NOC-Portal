import React, { createContext, useContext, useEffect, useState } from "react"

import { supabase } from "../lib/supabase"

type Theme = "dark" | "light"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
  userId?: string
  remoteTheme?: string | null
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "vite-ui-theme",
  userId,
  remoteTheme,
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => (localStorage.getItem(storageKey) as Theme) || defaultTheme
  )

  // Initial load from local storage
  useEffect(() => {
    const savedTheme = localStorage.getItem(storageKey) as Theme;
    if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
      setTheme(savedTheme);
    } else {
      setTheme(defaultTheme);
    }
  }, [storageKey, defaultTheme]);

  // Sync from DB remote theme when it loads
  useEffect(() => {
    if (remoteTheme && (remoteTheme === 'light' || remoteTheme === 'dark')) {
      const savedTheme = localStorage.getItem(storageKey);
      if (savedTheme !== remoteTheme) {
        localStorage.setItem(storageKey, remoteTheme);
        setTheme(remoteTheme as Theme);
      }
    }
  }, [remoteTheme, storageKey]);

  useEffect(() => {
    const root = window.document.documentElement

    root.classList.remove("light", "dark")
    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: async (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme)
      setTheme(newTheme)
      if (userId) {
        try {
          await supabase.from('profiles').update({ theme: newTheme }).eq('id', userId);
        } catch (error) {
          console.error("Error updating theme in database:", error);
        }
      }
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
