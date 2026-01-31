'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Button } from './button'
import Icon from './icon'

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  
  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])
  
  if (!mounted) {
    // Return placeholder with same dimensions to avoid layout shift
    return (
      <Button
        variant="ghost"
        size="sm"
        className="w-9 h-9 p-0"
        aria-label="Toggle theme"
        disabled
      >
        <Icon name="moon" className="w-4 h-4 text-gray-400 opacity-50" />
      </Button>
    )
  }
  
  const toggleTheme = () => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }
  
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleTheme}
      className="w-9 h-9 p-0"
      aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
    >
      <Icon
        name={resolvedTheme === 'dark' ? 'sun' : 'moon'}
        className="w-4 h-4 text-gray-300 hover:text-white"
      />
    </Button>
  )
}