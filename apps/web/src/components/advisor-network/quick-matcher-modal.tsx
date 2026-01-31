'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { searchAdvisorsAction } from '@/lib/actions/advisor-actions';
import type { Advisor } from '@/types/advisor-network';

interface QuickMatcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ChallengeOption {
  id: string;
  icon: string;
  keywords: string[];
  suggestedSkills: string[];
  urgency: 'low' | 'medium' | 'high';
}

const CHALLENGE_OPTIONS: ChallengeOption[] = [
  {
    id: 'architecture',
    icon: 'building',
    keywords: ['architecture', 'system design', 'scalability', 'microservices', 'monolith'],
    suggestedSkills: ['System Design', 'Architecture', 'Microservices', 'AWS', 'Kubernetes'],
    urgency: 'high'
  },
  {
    id: 'performance',
    icon: 'zap',
    keywords: ['performance', 'optimization', 'slow', 'memory', 'database'],
    suggestedSkills: ['Performance', 'Database', 'Optimization', 'Profiling', 'Caching'],
    urgency: 'high'
  },
  {
    id: 'debugging',
    icon: 'bug',
    keywords: ['bug', 'debugging', 'error', 'issue', 'troubleshooting'],
    suggestedSkills: ['Debugging', 'Testing', 'Error Handling', 'Logging', 'Monitoring'],
    urgency: 'high'
  },
  {
    id: 'code-review',
    icon: 'search',
    keywords: ['code review', 'best practices', 'security', 'patterns', 'quality'],
    suggestedSkills: ['Code Review', 'Security', 'Design Patterns', 'Clean Code', 'Refactoring'],
    urgency: 'medium'
  },
  {
    id: 'technology',
    icon: 'layers',
    keywords: ['technology', 'framework', 'database', 'cloud', 'stack'],
    suggestedSkills: ['Technology Strategy', 'Framework Selection', 'Cloud Architecture', 'DevOps'],
    urgency: 'medium'
  },
  {
    id: 'career',
    icon: 'trending-up',
    keywords: ['career', 'growth', 'leadership', 'skills', 'mentorship'],
    suggestedSkills: ['Career Guidance', 'Technical Leadership', 'Mentorship', 'Skill Development'],
    urgency: 'low'
  }
];

export function QuickMatcherModal({ isOpen, onClose }: QuickMatcherModalProps) {
  const t = useTranslations('advisor.client.quickMatcher');
  const [step, setStep] = useState<'challenge' | 'details' | 'matches'>('challenge');
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeOption | null>(null);
  const [challengeDetails, setChallengeDetails] = useState('');
  const [timeline, setTimeline] = useState<'urgent' | 'week' | 'month'>('week');
  const [matchedAdvisors, setMatchedAdvisors] = useState<Advisor[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('challenge');
      setSelectedChallenge(null);
      setChallengeDetails('');
      setTimeline('week');
      setMatchedAdvisors([]);
    }
  }, [isOpen]);

  const handleChallengeSelect = (challenge: ChallengeOption) => {
    setSelectedChallenge(challenge);
    setStep('details');
  };

  const handleFindMatches = async () => {
    if (!selectedChallenge) return;
    
    setIsLoading(true);
    setStep('matches');
    
    try {
      // Search for advisors based on selected challenge skills
      const result = await searchAdvisorsAction({
        skills: selectedChallenge.suggestedSkills,
        available_only: true,
        rating_min: 4.0,
        limit: 6
      });
      
      if (result.success && result.data) {
        setMatchedAdvisors(result.data.advisors);
      }
    } catch (error) {
      console.error('Failed to find advisor matches:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] mx-4 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <Icon name="message-square" className="w-6 h-6 text-primary" />
            <h2 className="text-xl font-semibold text-white">
              {t('title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <Icon name="x" className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {step === 'challenge' && (
            <ChallengeSelectionStep 
              challenges={CHALLENGE_OPTIONS}
              onSelect={handleChallengeSelect}
            />
          )}
          
          {step === 'details' && selectedChallenge && (
            <ChallengeDetailsStep
              challenge={selectedChallenge}
              details={challengeDetails}
              timeline={timeline}
              onDetailsChange={setChallengeDetails}
              onTimelineChange={setTimeline}
              onBack={() => setStep('challenge')}
              onNext={handleFindMatches}
            />
          )}
          
          {step === 'matches' && (
            <AdvisorMatchesStep
              challenge={selectedChallenge}
              advisors={matchedAdvisors}
              isLoading={isLoading}
              onBack={() => setStep('details')}
              onClose={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ChallengeSelectionStep({ 
  challenges, 
  onSelect 
}: { 
  challenges: ChallengeOption[]; 
  onSelect: (challenge: ChallengeOption) => void;
}) {
  const t = useTranslations('advisor.client.quickMatcher.challengeSelection');
  
  return (
    <div className="p-6">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-white mb-2">
          {t('title')}
        </h3>
        <p className="text-gray-400">
          {t('subtitle')}
        </p>
      </div>
      
      <div className="grid md:grid-cols-2 gap-4">
        {challenges.map((challenge) => (
          <button
            key={challenge.id}
            onClick={() => onSelect(challenge)}
            className="p-4 text-start bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-primary/50 rounded-lg transition-all duration-200 group"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mt-1">
                <Icon name={challenge.icon as any} className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-medium text-white group-hover:text-primary transition-colors">
                    {t(`challenges.${challenge.id}.title`)}
                  </h4>
                  {challenge.urgency === 'high' && (
                    <Badge variant="destructive" className="text-xs">
                      {t('urgentBadge')}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {t(`challenges.${challenge.id}.description`)}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {challenge.suggestedSkills.slice(0, 3).map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs !text-gray-300 !border-gray-600">
                      {skill}
                    </Badge>
                  ))}
                  {challenge.suggestedSkills.length > 3 && (
                    <Badge variant="outline" className="text-xs !text-gray-500 !border-gray-600">
                      +{challenge.suggestedSkills.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChallengeDetailsStep({
  challenge,
  details,
  timeline,
  onDetailsChange,
  onTimelineChange,
  onBack,
  onNext
}: {
  challenge: ChallengeOption;
  details: string;
  timeline: 'urgent' | 'week' | 'month';
  onDetailsChange: (details: string) => void;
  onTimelineChange: (timeline: 'urgent' | 'week' | 'month') => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('advisor.client.quickMatcher.challengeDetails');
  const tChallenges = useTranslations('advisor.client.quickMatcher.challengeSelection.challenges');
  
  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <Icon name="arrow-left" className="w-4 h-4 me-1" />
          {t('backButton')}
        </Button>
        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
          <Icon name={challenge.icon as any} className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-white">{tChallenges(`${challenge.id}.title`)}</h3>
          <p className="text-sm text-gray-400">{t('subtitle')}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {t('descriptionLabel')}
          </label>
          <textarea
            value={details}
            onChange={(e) => onDetailsChange(e.target.value)}
            placeholder={t('descriptionPlaceholder')}
            className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded-md text-white placeholder-gray-500 focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            {t('descriptionHelp')}
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            {t('timelineLabel')}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'urgent', key: 'urgent' },
              { value: 'week', key: 'week' },
              { value: 'month', key: 'month' }
            ].map((option) => (
              <button
                key={option.value}
                onClick={() => onTimelineChange(option.value as any)}
                className={`p-3 border rounded-lg text-center transition-all ${
                  timeline === option.value
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                <div className="font-medium">{t(`timelineOptions.${option.key}.label`)}</div>
                <div className="text-xs text-gray-400 mt-1">{t(`timelineOptions.${option.key}.description`)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-800/50 p-4 rounded-lg">
          <h4 className="font-medium text-white mb-2">{t('recommendedSkills')}</h4>
          <div className="flex flex-wrap gap-2">
            {challenge.suggestedSkills.map((skill) => (
              <Badge key={skill} variant="secondary" className="text-sm">
                {skill}
              </Badge>
            ))}
          </div>
        </div>

        <Button onClick={onNext} size="lg" className="w-full">
          <Icon name="search" className="w-4 h-4 me-2" />
          {t('findMatchesButton')}
        </Button>
      </div>
    </div>
  );
}

function AdvisorMatchesStep({
  challenge,
  advisors,
  isLoading,
  onBack,
  onClose
}: {
  challenge: ChallengeOption | null;
  advisors: Advisor[];
  isLoading: boolean;
  onBack: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('advisor.client.quickMatcher.matches');
  const tChallenges = useTranslations('advisor.client.quickMatcher.challengeSelection.challenges');
  
  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('loading.title')}</h3>
          <p className="text-gray-400">
            {t('loading.subtitle')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <Icon name="arrow-left" className="w-4 h-4 me-1" />
            {t('backButton')}
          </Button>
          <div>
            <h3 className="text-xl font-bold text-white">
              {t('resultsTitle', { count: advisors.length })}
            </h3>
            {challenge && (
              <p className="text-sm text-gray-400">
                {t('resultsSubtitle', { challenge: tChallenges(`${challenge.id}.title`).toLowerCase() })}
              </p>
            )}
          </div>
        </div>
      </div>

      {advisors.length === 0 ? (
        <div className="text-center py-12">
          <Icon name="users" className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-semibold text-white mb-2">{t('noMatches.title')}</h4>
          <p className="text-gray-400 mb-6">
            {t('noMatches.subtitle')}
          </p>
          <Button asChild>
            <Link href="/advisors" onClick={onClose}>
              {t('noMatches.browseButton')}
            </Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {advisors.map((advisor) => (
            <Card key={advisor.id} className="!bg-gray-800 !border-gray-700" style={{ backgroundColor: '#1f2937', borderColor: '#374151' }}>
              <CardContent className="p-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-primary to-primary/60 rounded-full flex items-center justify-center flex-shrink-0">
                    {advisor.avatar_url ? (
                      <img 
                        src={advisor.avatar_url} 
                        alt={advisor.display_name}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-bold">
                        {advisor.display_name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-white">{advisor.display_name ?? 'Anonymous'}</h4>
                      <div className="flex items-center gap-1">
                        <Icon name="star" className="w-4 h-4 text-yellow-500 fill-current" />
                        <span className="text-sm text-gray-300">{(Number(advisor.rating) || 0).toFixed(1)}</span>
                        <span className="text-xs text-gray-500">({Number(advisor.review_count) || 0})</span>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(advisor.skills ?? []).slice(0, 4).map((skill) => (
                        <Badge key={skill} variant="secondary" className="text-xs">
                          {skill}
                        </Badge>
                      ))}
                      {advisor.skills.length > 4 && (
                        <Badge variant="outline" className="text-xs !text-gray-500">
                          {t('advisorCard.moreSkills', { count: advisor.skills.length - 4 })}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className={advisor.is_accepting_bookings ? "text-green-400" : "text-orange-400"}>
                          {advisor.is_accepting_bookings ? t('advisorCard.availableNow') : t('advisorCard.notAccepting')}
                        </span>
                        {advisor.years_experience && (
                          <span className="text-gray-500 ml-2">
                            • {t('advisorCard.yearsExperience', { years: advisor.years_experience })}
                          </span>
                        )}
                      </div>
                      
                      <Button asChild size="sm">
                        <Link href={`/advisors/${advisor.user_id}`} onClick={onClose}>
                          {t('advisorCard.bookButton')}
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          <div className="text-center pt-4">
            <Button asChild variant="outline">
              <Link href="/advisors" onClick={onClose}>
                <Icon name="users" className="w-4 h-4 me-2" />
                {t('seeAllButton')}
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}