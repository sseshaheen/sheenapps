"use client"

import { m } from '@/components/ui/motion-provider'
import { cn } from "@/lib/utils"

interface AnimatedTextProps {
  text: string
  className?: string
  delay?: number
  stagger?: number
  dir?: 'ltr' | 'rtl'
}

export function AnimatedText({
  text,
  className,
  delay = 0,
  stagger = 0.05,
  dir = 'ltr',
}: AnimatedTextProps) {
  const words = text.split(' ')
  const direction = dir || 'ltr'

  return (
    <m.span
      className="inline-block"
      dir={direction}
      style={{ direction: direction, unicodeBidi: 'isolate' }}
    >
      {words.map((word, i) => (
        <m.span
          key={i}
          className={cn('inline-block', className)}
          dir={direction}
          style={{ direction: direction, unicodeBidi: 'isolate' }}
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{
            delay: delay + i * stagger,
            duration: 0.8,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {word}
          {i < words.length - 1 ? '\u00A0' : ''}
        </m.span>
      ))}
    </m.span>
  )
}
