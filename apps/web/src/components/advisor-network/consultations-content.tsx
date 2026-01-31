'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';

interface ConsultationsContentProps {
  translations: {
    consultations: {
      title: string;
      list: {
        upcoming: string;
        completed: string;
        cancelled: string;
        all: string;
        empty: {
          upcoming: string;
          completed: string;
          cancelled: string;
        };
      };
      card: {
        duration: string;
        status: {
          scheduled: string;
          in_progress: string;
          completed: string;
          cancelled: string;
          no_show: string;
        };
        actions: {
          join: string;
          cancel: string;
          reschedule: string;
          review: string;
          viewRecording: string;
        };
      };
    };
  };
}

// Mock consultation data
const mockConsultations = [
  {
    id: '1',
    advisorName: 'Sarah Chen',
    advisorId: 'advisor-1',
    date: '2025-01-15',
    time: '14:00',
    duration: 30,
    status: 'scheduled',
    price: 45,
    notes: 'Need help with React state management patterns',
    meetingUrl: 'https://meet.google.com/abc-def-ghi'
  },
  {
    id: '2',
    advisorName: 'Mike Johnson',
    advisorId: 'advisor-2',
    date: '2025-01-10',
    time: '16:30',
    duration: 60,
    status: 'completed',
    price: 90,
    notes: 'Code review for Node.js backend architecture',
    rating: 5
  },
  {
    id: '3',
    advisorName: 'Alex Rodriguez',
    advisorId: 'advisor-3',
    date: '2025-01-05',
    time: '10:00',
    duration: 15,
    status: 'cancelled',
    price: 22.50,
    notes: 'Quick question about TypeScript interfaces'
  }
];

export function ConsultationsContent({ translations }: ConsultationsContentProps) {
  const [activeTab, setActiveTab] = useState('upcoming');

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      scheduled: { variant: 'default' as const, color: 'text-blue-600', icon: 'calendar' },
      in_progress: { variant: 'default' as const, color: 'text-green-600', icon: 'play' },
      completed: { variant: 'secondary' as const, color: 'text-green-600', icon: 'check' },
      cancelled: { variant: 'destructive' as const, color: 'text-red-600', icon: 'x' },
      no_show: { variant: 'destructive' as const, color: 'text-red-600', icon: 'user-x' }
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon name={config.icon as any} className="h-3 w-3" />
        {translations.consultations.card.status[status as keyof typeof translations.consultations.card.status]}
      </Badge>
    );
  };

  const filterConsultations = (status: string) => {
    if (status === 'all') return mockConsultations;
    if (status === 'upcoming') return mockConsultations.filter(c => c.status === 'scheduled' || c.status === 'in_progress');
    if (status === 'completed') return mockConsultations.filter(c => c.status === 'completed');
    if (status === 'cancelled') return mockConsultations.filter(c => c.status === 'cancelled' || c.status === 'no_show');
    return mockConsultations;
  };

  const ConsultationCard = ({ consultation }: { consultation: typeof mockConsultations[0] }) => (
    <Card key={consultation.id}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{consultation.advisorName}</CardTitle>
            <CardDescription>
              {consultation.date} at {consultation.time} • {consultation.duration}min • ${consultation.price}
            </CardDescription>
          </div>
          {getStatusBadge(consultation.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {consultation.notes && (
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground italic">"{consultation.notes}"</p>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Icon name="clock" className="h-4 w-4" />
              {consultation.duration} {translations.consultations.card.duration.toLowerCase()}
            </span>
            {consultation.rating && (
              <span className="flex items-center gap-1">
                <Icon name="star" className="h-4 w-4 text-yellow-500" />
                {consultation.rating}/5
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {consultation.status === 'scheduled' && (
              <>
                <Button size="sm" variant="outline">
                  {translations.consultations.card.actions.reschedule}
                </Button>
                <Button size="sm" asChild>
                  <a href={consultation.meetingUrl} target="_blank" rel="noopener noreferrer">
                    {translations.consultations.card.actions.join}
                  </a>
                </Button>
              </>
            )}
            
            {consultation.status === 'completed' && !consultation.rating && (
              <Button size="sm" variant="outline">
                {translations.consultations.card.actions.review}
              </Button>
            )}
            
            {consultation.status === 'completed' && (
              <Button size="sm" variant="outline">
                {translations.consultations.card.actions.viewRecording}
              </Button>
            )}

            <Button size="sm" variant="ghost" asChild>
              <Link href={`/advisors/${consultation.advisorId}`}>
                View Profile
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Icon name="calendar" className="h-4 w-4 text-blue-600" />
              <div>
                <p className="text-sm font-medium">Upcoming</p>
                <p className="text-2xl font-bold">1</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Icon name="check" className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium">Completed</p>
                <p className="text-2xl font-bold">1</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Icon name="x" className="h-4 w-4 text-red-600" />
              <div>
                <p className="text-sm font-medium">Cancelled</p>
                <p className="text-2xl font-bold">1</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Icon name="dollar-sign" className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium">Total Spent</p>
                <p className="text-2xl font-bold">$157.50</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Consultations List */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upcoming">{translations.consultations.list.upcoming}</TabsTrigger>
          <TabsTrigger value="completed">{translations.consultations.list.completed}</TabsTrigger>
          <TabsTrigger value="cancelled">{translations.consultations.list.cancelled}</TabsTrigger>
          <TabsTrigger value="all">{translations.consultations.list.all}</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="space-y-4">
          {filterConsultations('upcoming').length > 0 ? (
            filterConsultations('upcoming').map(consultation => (
              <ConsultationCard key={consultation.id} consultation={consultation} />
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Icon name="calendar" className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{translations.consultations.list.empty.upcoming}</p>
                <Button className="mt-4" asChild>
                  <Link href="/advisor/browse">Browse Advisors</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          {filterConsultations('completed').length > 0 ? (
            filterConsultations('completed').map(consultation => (
              <ConsultationCard key={consultation.id} consultation={consultation} />
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Icon name="check" className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{translations.consultations.list.empty.completed}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cancelled" className="space-y-4">
          {filterConsultations('cancelled').length > 0 ? (
            filterConsultations('cancelled').map(consultation => (
              <ConsultationCard key={consultation.id} consultation={consultation} />
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <Icon name="x" className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{translations.consultations.list.empty.cancelled}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {mockConsultations.map(consultation => (
            <ConsultationCard key={consultation.id} consultation={consultation} />
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}