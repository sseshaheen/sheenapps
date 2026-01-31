"use client"

import { m } from "@/components/ui/motion-provider"
import { cn } from "@/lib/utils"

interface GradientOrbProps {
  className?: string
  size?: "sm" | "md" | "lg" | "xl"
  delay?: number
}

const sizes = {
  sm: "w-[200px] h-[200px]",
  md: "w-[400px] h-[400px]",
  lg: "w-[600px] h-[600px]",
  xl: "w-[800px] h-[800px]"
}

export function GradientOrb({ className, size = "md", delay = 0 }: GradientOrbProps) {
  return (
    <m.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ 
        opacity: [0.3, 0.6, 0.3],
        scale: [0.8, 1.1, 0.8],
        x: [0, 100, -100, 0],
        y: [0, -100, 100, 0],
      }}
      transition={{
        duration: 20,
        repeat: Infinity,
        ease: "easeInOut",
        delay
      }}
      className={cn(
        "absolute rounded-full blur-3xl",
        "bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600",
        sizes[size],
        className
      )}
    />
  )
}