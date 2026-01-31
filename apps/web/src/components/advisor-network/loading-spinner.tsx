'use client'

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function LoadingSpinner() {
  return (
    <div className="space-y-6">
      {/* Search and Filter Loading */}
      <div className="flex flex-col lg:flex-row gap-4">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 lg:w-32" />
      </div>

      {/* Grid Loading */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <AdvisorCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function AdvisorCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>

        {/* Bio */}
        <div className="space-y-2 mb-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>

        {/* Skills */}
        <div className="flex gap-2 mb-4">
          <Skeleton className="h-6 w-16 rounded-md" />
          <Skeleton className="h-6 w-20 rounded-md" />
          <Skeleton className="h-6 w-14 rounded-md" />
        </div>

        {/* Languages */}
        <Skeleton className="h-4 w-1/3 mb-2" />
        
        {/* Status */}
        <Skeleton className="h-4 w-1/4" />
      </CardContent>

      {/* Footer */}
      <div className="p-6 pt-0 flex gap-2">
        <Skeleton className="h-8 flex-1" />
        <Skeleton className="h-8 flex-1" />
      </div>
    </Card>
  );
}