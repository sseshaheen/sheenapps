'use client'

import { cn } from '@/lib/utils';

interface BarChartProps {
  data: Array<{ [key: string]: any }>;
  xKey: string;
  yKey: string;
  className?: string;
}

interface LineChartProps {
  data: Array<{ [key: string]: any }>;
  xKey: string;
  yKey: string;
  className?: string;
  formatValue?: (value: any) => string;
}

interface PieChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  className?: string;
}

export function BarChart({ data, xKey, yKey, className }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground", className)}>
        No data to display
      </div>
    );
  }

  const maxValue = Math.max(...data.map(item => item[yKey]));
  
  return (
    <div className={cn("space-y-3", className)}>
      {data.map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="w-16 text-sm text-muted-foreground">
            {item[xKey]}
          </div>
          <div className="flex-1 bg-muted rounded-full h-3 relative">
            <div 
              className="bg-primary rounded-full h-3 transition-all duration-500"
              style={{ 
                width: `${(item[yKey] / maxValue) * 100}%` 
              }}
            />
          </div>
          <div className="w-12 text-sm text-right">
            {item[yKey]}
          </div>
        </div>
      ))}
    </div>
  );
}

export function LineChart({ data, xKey, yKey, className, formatValue }: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground", className)}>
        No data to display
      </div>
    );
  }

  const maxValue = Math.max(...data.map(item => item[yKey]));
  const minValue = Math.min(...data.map(item => item[yKey]));
  const range = maxValue - minValue;
  
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.map((item, index) => (
          <div key={index} className="text-center space-y-2">
            <div className="text-sm text-muted-foreground">{item[xKey]}</div>
            <div className="text-lg font-semibold">
              {formatValue ? formatValue(item[yKey]) : item[yKey]}
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary rounded-full h-2 transition-all duration-500"
                style={{ 
                  width: range > 0 ? `${((item[yKey] - minValue) / range) * 100}%` : '0%'
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PieChart({ data, className }: PieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground", className)}>
        No data to display
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  
  return (
    <div className={cn("space-y-4", className)}>
      <div className="grid grid-cols-2 gap-4">
        {data.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <div 
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-sm">{item.name}</span>
            <span className="text-sm text-muted-foreground">({item.value})</span>
          </div>
        ))}
      </div>
      <div className="flex h-4 rounded-full overflow-hidden">
        {data.map((item, index) => (
          <div
            key={index}
            className="transition-all duration-500"
            style={{
              backgroundColor: item.color,
              width: `${(item.value / total) * 100}%`
            }}
          />
        ))}
      </div>
    </div>
  );
}