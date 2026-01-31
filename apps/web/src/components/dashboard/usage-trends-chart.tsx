'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface UsageTrendsChartProps {
  data: any[]
  metric: string
  limit: number
}

export function UsageTrendsChart({ data, metric, limit }: UsageTrendsChartProps) {
  // Calculate statistics
  const currentMonth = data.slice(-30)
  const totalUsage = currentMonth.reduce((sum, day) => sum + (day[metric] || 0), 0)
  const avgDaily = Math.round(totalUsage / currentMonth.length)
  const maxDaily = Math.max(...currentMonth.map(day => day[metric] || 0))
  
  // Find max value for scaling
  const maxValue = Math.max(maxDaily, limit / 30)
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>30-Day Usage Trend</span>
          <div className="flex gap-2">
            <Badge variant="outline">Avg: {avgDaily}/day</Badge>
            <Badge variant="outline">Max: {maxDaily}/day</Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-48">
          {/* Chart bars */}
          <div className="absolute inset-0 flex items-end justify-between gap-1">
            {currentMonth.map((day, index) => {
              const value = day[metric] || 0
              const heightPercent = (value / maxValue) * 100
              const isToday = index === currentMonth.length - 1
              
              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center group relative"
                >
                  <div
                    className={cn(
                      "w-full rounded-t transition-all",
                      isToday ? "bg-blue-600" : "bg-blue-500 group-hover:bg-blue-600"
                    )}
                    style={{ height: `${heightPercent}%` }}
                  />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 opacity-0 group-hover:opacity-100 
                                bg-gray-800 text-white text-xs rounded px-2 py-1 
                                pointer-events-none transition-opacity z-10 whitespace-nowrap">
                    Day {day.day}: {value} uses
                  </div>
                  
                  {/* Day marker for every 5th day */}
                  {day.day % 5 === 0 && (
                    <span className="absolute -bottom-5 text-xs text-gray-500">
                      {day.day}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          
          {/* Limit line */}
          {limit > 0 && (
            <div 
              className="absolute w-full border-t-2 border-dashed border-red-400"
              style={{ bottom: `${(limit / 30 / maxValue) * 100}%` }}
            >
              <span className="absolute -top-3 right-0 text-xs text-red-600 bg-white px-1">
                Daily limit: {Math.round(limit / 30)}
              </span>
            </div>
          )}
          
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 -ml-8 h-full flex flex-col justify-between text-xs text-gray-500">
            <span>{Math.round(maxValue)}</span>
            <span>{Math.round(maxValue / 2)}</span>
            <span>0</span>
          </div>
        </div>
        
        {/* X-axis label */}
        <div className="text-center text-xs text-gray-500 mt-6">
          Days of the month
        </div>
        
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="text-center">
            <div className="text-2xl font-semibold">{totalUsage}</div>
            <div className="text-xs text-gray-500">Total Used</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold">
              {limit === -1 ? '∞' : limit - totalUsage}
            </div>
            <div className="text-xs text-gray-500">Remaining</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold">
              {Math.round((totalUsage / (limit === -1 ? totalUsage : limit)) * 100)}%
            </div>
            <div className="text-xs text-gray-500">Used</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}