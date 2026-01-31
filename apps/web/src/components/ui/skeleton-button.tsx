interface SkeletonButtonProps {
  width?: number
  height?: number
  className?: string
}

export function SkeletonButton({ 
  width = 88, 
  height = 32, 
  className = '' 
}: SkeletonButtonProps) {
  return (
    <div 
      className={`animate-pulse bg-gray-200 dark:bg-gray-700 rounded-md ${className}`}
      style={{ width: `${width}px`, height: `${height}px` }}
      aria-label="Loading..."
    />
  )
}