'use client'

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Icon } from '@/components/ui/icon';
import type { ConsultationDuration } from '@/types/advisor-network';

interface CalComEmbedProps {
  advisorId: string;
  duration: ConsultationDuration;
  calComUrl?: string;
  onSelect: (dateTime: string, bookingId?: string) => void;
}

export function CalComEmbed({ advisorId, duration, calComUrl, onSelect }: CalComEmbedProps) {
  const embedRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If no Cal.com URL is provided, show error
    if (!calComUrl) {
      setError('This advisor has not set up calendar scheduling yet.');
      setIsLoading(false);
      return;
    }

    // Load Cal.com embed script
    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://app.cal.com/embed/embed.js';
    
    script.onload = () => {
      try {
        // Initialize Cal.com embed
        const Cal = (window as any).Cal;
        if (!Cal) {
          throw new Error('Cal.com embed failed to load');
        }

        Cal('init', { origin: 'https://app.cal.com' });

        // Configure the embed
        if (embedRef.current) {
          Cal('inline', {
            elementOrSelector: embedRef.current,
            config: {
              layout: 'month_view',
              theme: 'light',
            },
            calLink: calComUrl,
          });

          // Listen for booking events
          Cal('on', {
            action: 'bookingSuccessful',
            callback: (e: any) => {
              const { date, bookingId } = e.detail;
              onSelect(date, bookingId);
            }
          });

          setIsLoading(false);
        }
      } catch (err) {
        setError('Failed to load calendar. Please try again.');
        setIsLoading(false);
      }
    };

    script.onerror = () => {
      setError('Failed to load calendar widget.');
      setIsLoading(false);
    };

    document.head.appendChild(script);

    // Cleanup
    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
      // Clean up Cal.com instance if it exists
      const Cal = (window as any).Cal;
      if (Cal) {
        try {
          Cal('destroy');
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [advisorId, duration, calComUrl, onSelect]);

  if (error) {
    return (
      <Alert variant="destructive">
        <Icon name="calendar-x" className="h-4 w-4" />
        <AlertDescription>
          {error}
          <div className="mt-2">
            <p className="text-sm">
              You can contact the advisor directly or try booking again later.
            </p>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-4">
              <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading calendar...</p>
            </div>
          </div>
        )}
        
        {/* Cal.com embed will be inserted here */}
        <div 
          ref={embedRef} 
          className={`min-h-[400px] ${isLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
        />
        
        {!isLoading && !error && (
          <div className="mt-4 p-3 bg-muted rounded-lg text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Icon name="info" className="h-4 w-4" />
              <span>Select a time slot above to continue with your booking</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Fallback calendar component for development/demo
export function CalComEmbedFallback({ advisorId, duration, onSelect }: CalComEmbedProps) {
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  // Generate some demo time slots
  const generateTimeSlots = () => {
    const slots = [];
    const now = new Date();
    
    for (let i = 1; i <= 7; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      
      // Add morning slot
      const morning = new Date(date);
      morning.setHours(10, 0, 0, 0);
      slots.push({
        id: `${advisorId}-${i}-morning`,
        dateTime: morning.toISOString(),
        display: morning.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      });

      // Add afternoon slot
      const afternoon = new Date(date);
      afternoon.setHours(15, 0, 0, 0);
      slots.push({
        id: `${advisorId}-${i}-afternoon`,
        dateTime: afternoon.toISOString(),
        display: afternoon.toLocaleDateString('en-US', { 
          weekday: 'long', 
          month: 'short', 
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
      });
    }
    
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const handleSlotSelect = (slot: { id: string; dateTime: string }) => {
    setSelectedSlot(slot.id);
    // Simulate Cal.com booking process
    setTimeout(() => {
      onSelect(slot.dateTime, slot.id);
    }, 500);
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
            <Icon name="info" className="h-4 w-4 inline me-2" />
            Demo calendar - In production, this would be a real Cal.com embed
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {timeSlots.map((slot) => (
              <button
                key={slot.id}
                onClick={() => handleSlotSelect(slot)}
                disabled={selectedSlot === slot.id}
                className={`p-3 border rounded-lg text-left transition-colors hover:border-primary ${
                  selectedSlot === slot.id 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border'
                }`}
              >
                <div className="text-sm font-medium">{slot.display}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {duration} minute session
                </div>
                {selectedSlot === slot.id && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                    <Icon name="loader-2" className="h-3 w-3 animate-spin" />
                    Booking...
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}