"use client"

import { m } from "@/components/ui/motion-provider"
import { Button } from "@/components/ui/button"
import { forwardRef } from "react"
import type { ButtonProps } from "@/components/ui/button"

export const TouchOptimizedButton = forwardRef<
  HTMLButtonElement,
  ButtonProps & { 
    children: React.ReactNode
    whileTap?: object
    whileHover?: object
  }
>(({ children, whileTap, whileHover, ...props }, ref) => {
  // If both animations are disabled, don't use motion at all
  if (whileHover === undefined && whileTap === undefined) {
    return (
      <Button ref={ref} {...props}>
        {children}
      </Button>
    )
  }

  return (
    <m.div
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      whileTap={whileTap as any}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      whileHover={whileHover as any}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="transform-gpu" // Use GPU acceleration to prevent layout shifts
    >
      <Button ref={ref} {...props}>
        {children}
      </Button>
    </m.div>
  )
})

TouchOptimizedButton.displayName = "TouchOptimizedButton"