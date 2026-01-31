import { cn } from "@/lib/utils"

/**
 * Skeleton Component
 *
 * Used for loading placeholders. Respects user's reduced motion preferences
 * via the motion-reduce: variant.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }