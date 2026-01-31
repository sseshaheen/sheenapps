"use client"

import { m } from "@/components/ui/motion-provider"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

interface MobileOptimizedOrbProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  delay?: number
}

const sizes = {
  sm: "w-32 h-32 sm:w-48 sm:h-48 md:w-64 md:h-64",
  md: "w-48 h-48 sm:w-64 sm:h-64 md:w-96 md:h-96",
  lg: "w-64 h-64 sm:w-96 sm:h-96 md:w-[32rem] md:h-[32rem]",
  xl: "w-96 h-96 sm:w-[32rem] sm:h-[32rem] md:w-[48rem] md:h-[48rem]"
}

export function MobileOptimizedOrb({ className, size = "md", delay = 0 }: MobileOptimizedOrbProps) {
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    // Check for reduced motion preference
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mediaQuery.matches)
    
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches)
    mediaQuery.addEventListener('change', handler)
    
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  const animation = reduceMotion ? {
    opacity: [0.2, 0.4, 0.2],
    transition: {
      duration: 8,
      repeat: Infinity,
      ease: "easeInOut",
      delay
    }
  } : {
    opacity: [0.2, 0.5, 0.2],
    scale: [0.8, 1.1, 0.8],
    x: [0, 50, -50, 0],
    y: [0, -50, 50, 0],
    transition: {
      duration: 15,
      repeat: Infinity,
      ease: "easeInOut",
      delay
    }
  }

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.8 }}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      animate={animation as any}
      className={cn(
        "absolute rounded-full blur-2xl sm:blur-3xl",
        "bg-gradient-to-r from-purple-600/40 via-pink-600/40 to-blue-600/40",
        "sm:from-purple-600/30 sm:via-pink-600/30 sm:to-blue-600/30",
        sizes[size],
        className
      )}
    />
  )
}