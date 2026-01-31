'use client'

import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

interface AdvisorSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function AdvisorSearch({ 
  value, 
  onChange, 
  placeholder = "Search advisors...", 
  className 
}: AdvisorSearchProps) {
  const [isFocused, setIsFocused] = useState(false);

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Icon 
          name="search" 
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" 
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          className={cn(
            "pl-10 pr-10 transition-colors",
            isFocused && "ring-2 ring-primary/20"
          )}
        />
        {value && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground hover:text-foreground transition-colors"
            type="button"
            aria-label="Clear search"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}