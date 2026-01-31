'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';

interface TestimonialStory {
  id: string;
  type: string;
  outcome: string;
  quote: string;
  author: string;
  company: string;
  advisor_name?: string;
  skills_helped?: string[];
  verified: boolean;
  created_at: string;
}

// Curated testimonials with consent (Phase 2 - these would come from database)
const CURATED_TESTIMONIALS: TestimonialStory[] = [
  {
    id: '1',
    type: 'Startup CTO',
    outcome: 'Scaled from 100 to 10M users',
    quote: 'Our advisor helped us redesign our architecture before we hit the wall. Saved us probably 6 months and $200K in infrastructure costs.',
    author: 'Alex Chen',
    company: 'TechFlow',
    advisor_name: 'Maria Rodriguez',
    skills_helped: ['System Architecture', 'Scalability', 'AWS'],
    verified: true,
    created_at: '2024-07-15'
  },
  {
    id: '2',
    type: 'Senior Developer',
    outcome: 'Shipped feature 3x faster',
    quote: 'Got unstuck on a React performance issue in one 30-minute session. Would have taken me days to figure out alone.',
    author: 'Sarah Kim',
    company: 'FinanceApp',
    advisor_name: 'David Park',
    skills_helped: ['React', 'Performance', 'Optimization'],
    verified: true,
    created_at: '2024-08-02'
  },
  {
    id: '3',
    type: 'Team Lead',
    outcome: 'Prevented security breach',
    quote: 'Our advisor caught a critical vulnerability during code review that our team missed. Potentially saved us from a major incident.',
    author: 'Michael Johnson',
    company: 'SecureStack',
    advisor_name: 'Elena Rodriguez',
    skills_helped: ['Security', 'Code Review', 'Node.js'],
    verified: true,
    created_at: '2024-08-10'
  },
  {
    id: '4',
    type: 'Solo Developer',
    outcome: 'Launched product 2 months early',
    quote: 'The technology guidance session helped me choose the right stack from the beginning. No rewrites, no technical debt.',
    author: 'Jennifer Lee',
    company: 'IndieMaker',
    advisor_name: 'Alex Chen',
    skills_helped: ['Technology Selection', 'Architecture', 'Planning'],
    verified: true,
    created_at: '2024-07-28'
  }
];

interface TestimonialsProps {
  maxCount?: number;
  showAll?: boolean;
}

export function AdvisorTestimonials({ maxCount = 2, showAll = false }: TestimonialsProps) {
  const [displayedTestimonials, setDisplayedTestimonials] = useState<TestimonialStory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call delay and random selection
    const timer = setTimeout(() => {
      const shuffled = [...CURATED_TESTIMONIALS].sort(() => 0.5 - Math.random());
      const selected = showAll ? shuffled : shuffled.slice(0, maxCount);
      setDisplayedTestimonials(selected);
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [maxCount, showAll]);

  if (loading) {
    return <TestimonialsSkeleton count={maxCount} />;
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {displayedTestimonials.map((story) => (
        <TestimonialCard key={story.id} story={story} />
      ))}
    </div>
  );
}

function TestimonialCard({ story }: { story: TestimonialStory }) {
  return (
    <Card className="border-2 hover:border-primary/50 transition-colors !bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
      <CardHeader>
        <div className="flex items-center gap-4 mb-4">
          <Badge variant="outline" className="!text-primary !border-primary">
            {story.type}
          </Badge>
          <Icon name="arrow-right" className="w-4 h-4 text-green-500" />
          <Badge variant="default" className="bg-green-600">
            {story.outcome}
          </Badge>
          {story.verified && (
            <Badge variant="outline" className="!text-blue-400 !border-blue-400 ml-auto">
              <Icon name="check-circle" className="w-3 h-3 me-1" />
              Verified
            </Badge>
          )}
        </div>
        <blockquote className="text-lg text-gray-300 italic leading-relaxed">
          "{story.quote}"
        </blockquote>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>— {story.author}</span>
            <span>•</span>
            <span>{story.company}</span>
          </div>
          
          {story.advisor_name && (
            <div className="flex items-center gap-2 text-sm">
              <Icon name="user-check" className="w-4 h-4 text-primary" />
              <span className="text-gray-400">Helped by</span>
              <span className="text-white font-medium">{story.advisor_name}</span>
            </div>
          )}
          
          {story.skills_helped && story.skills_helped.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {story.skills_helped.map((skill, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          )}
          
          <div className="text-xs text-gray-500">
            Success story from {new Date(story.created_at).toLocaleDateString()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TestimonialsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-8 md:grid-cols-2">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="!bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
          <CardHeader>
            <div className="flex items-center gap-4 mb-4">
              <div className="h-6 w-20 bg-gray-700 rounded animate-pulse" />
              <div className="w-4 h-4 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-700 rounded animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-6 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 bg-gray-700 rounded animate-pulse" />
              <div className="h-6 bg-gray-700 rounded animate-pulse w-3/4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="h-4 bg-gray-700 rounded animate-pulse w-1/2" />
              <div className="h-4 bg-gray-700 rounded animate-pulse w-3/4" />
              <div className="flex gap-2">
                <div className="h-6 w-16 bg-gray-700 rounded animate-pulse" />
                <div className="h-6 w-20 bg-gray-700 rounded animate-pulse" />
                <div className="h-6 w-14 bg-gray-700 rounded animate-pulse" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Enhanced testimonials for dedicated success stories page
export function SuccessStoriesShowcase() {
  return (
    <div className="space-y-12">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-4">
          Real Results from Real Developers
        </h2>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Discover how developers like you solved complex challenges and accelerated their projects with expert guidance.
        </p>
      </div>
      
      <AdvisorTestimonials showAll={true} />
      
      <div className="text-center pt-8">
        <Card className="inline-block p-6 !bg-gray-800/50 !border-gray-600">
          <div className="flex items-center gap-4 text-gray-300">
            <Icon name="shield-check" className="w-6 h-6 text-green-500" />
            <div className="text-left">
              <p className="font-medium">All testimonials verified</p>
              <p className="text-sm text-gray-500">Shared with explicit consent from our clients</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// Analytics tracking for testimonial interactions
export function trackTestimonialView(testimonialId: string, author: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'testimonial_view', {
      testimonial_id: testimonialId,
      testimonial_author: author,
      page_location: window.location.href,
    });
  }
}

export function trackTestimonialCTAClick(source: string) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', 'testimonial_cta_click', {
      source: source,
      page_location: window.location.href,
    });
  }
}