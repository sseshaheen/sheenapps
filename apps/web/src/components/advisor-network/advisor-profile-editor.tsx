'use client'

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { useRouter } from '@/i18n/routing';
import { getMyAdvisorProfileAction, updateAdvisorProfileAction } from '@/lib/actions/advisor-actions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { Advisor } from '@/types/advisor-network';
import { logger } from '@/utils/logger';

interface AdvisorProfileEditorProps {
  translations: {
    advisor: {
      profile: {
        title: string;
        subtitle: string;
        personalInfo: {
          title: string;
          displayName: string;
          displayNamePlaceholder: string;
          bio: string;
          bioPlaceholder: string;
          avatar: string;
          location: string;
          languages: string;
        };
        expertise: {
          title: string;
          skills: string;
          skillsPlaceholder: string;
          specialties: string;
          specialtiesPlaceholder: string;
          experience: string;
          experienceHelp: string;
        };
        pricing: {
          title: string;
          hourlyRate: string;
          hourlyRateHelp: string;
          availability: string;
          availabilityHelp: string;
          timezone: string;
        };
        integrations: {
          title: string;
          calcom: string;
          calcomUrl: string;
          calcomPlaceholder: string;
          calcomHelp: string;
          stripe: string;
          stripeStatus: string;
          connectStripe: string;
          stripeConnected: string;
        };
        actions: {
          save: string;
          saving: string;
          cancel: string;
          preview: string;
        };
      };
    };
    common: {
      loading: string;
      error: string;
      success: string;
      required: string;
    };
  };
  locale: string;
}

interface FormData {
  display_name: string;
  bio: string;
  avatar_url: string;
  skills: string[];
  specialties: string[];
  languages: string[];
  hourly_rate: number | null;
  years_experience: number | null;
  cal_com_event_type_url: string;
  country_code: string;
  timezone: string;
  availability_schedule: string;
}

const POPULAR_SKILLS = [
  'React', 'Node.js', 'Python', 'JavaScript', 'TypeScript', 'Vue.js', 'Angular',
  'Docker', 'AWS', 'PostgreSQL', 'MongoDB', 'GraphQL', 'REST APIs', 'Next.js',
  'Express.js', 'Django', 'Flask', 'Ruby on Rails', 'PHP', 'Java', 'C#', '.NET',
  'Go', 'Rust', 'Swift', 'Kotlin', 'Flutter', 'React Native', 'iOS', 'Android',
  'DevOps', 'CI/CD', 'Kubernetes', 'Terraform', 'Redis', 'Elasticsearch'
];

const POPULAR_SPECIALTIES = [
  'Frontend Development', 'Backend Development', 'Full Stack Development',
  'Mobile Development', 'DevOps & Infrastructure', 'Database Design',
  'API Development', 'System Architecture', 'Performance Optimization',
  'Security', 'Testing & QA', 'Code Review', 'Technical Leadership',
  'Microservices', 'Cloud Architecture', 'Data Engineering', 'Machine Learning',
  'Web3 & Blockchain', 'Game Development', 'E-commerce', 'Fintech', 'Healthcare'
];

const LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese',
  'Japanese', 'Korean', 'Russian', 'Arabic', 'Hindi', 'Dutch', 'Swedish'
];

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland'
];

export function AdvisorProfileEditor({ translations, locale }: AdvisorProfileEditorProps) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  
  const [advisor, setAdvisor] = useState<Advisor | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [formData, setFormData] = useState<FormData>({
    display_name: '',
    bio: '',
    avatar_url: '',
    skills: [],
    specialties: [],
    languages: [],
    hourly_rate: null,
    years_experience: null,
    cal_com_event_type_url: '',
    country_code: 'US',
    timezone: 'America/New_York',
    availability_schedule: ''
  });

  // Load advisor profile
  useEffect(() => {
    async function loadAdvisorProfile() {
      if (!isAuthenticated || !user) {
        router.push('/auth/login?redirect=/advisor/profile');
        return;
      }

      setLoading(true);
      setError(null);

      try {
        logger.info('✏️ Loading advisor profile for editing', { userId: user.id.slice(0, 8) });
        
        const result = await getMyAdvisorProfileAction();
        
        if (!result.success) {
          throw new Error(result.error || 'Failed to load advisor profile');
        }

        if (!result.data) {
          throw new Error('No advisor data received');
        }

        const advisorData = result.data;
        setAdvisor(advisorData);
        
        // Populate form with advisor data
        setFormData({
          display_name: advisorData.display_name || '',
          bio: advisorData.bio || '',
          avatar_url: advisorData.avatar_url || '',
          skills: advisorData.skills || [],
          specialties: advisorData.specialties?.map(spec => spec.label) || [],
          languages: advisorData.languages || [],
          hourly_rate: advisorData.hourly_rate || null,
          years_experience: advisorData.years_experience || null,
          cal_com_event_type_url: advisorData.cal_com_event_type_url || '',
          country_code: advisorData.country_code || 'US',
          timezone: advisorData.timezone || 'America/New_York',
          availability_schedule: advisorData.availability_schedule || ''
        });

        logger.info('✅ Advisor profile loaded for editing', { 
          name: advisorData.display_name,
          status: advisorData.approval_status
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to load advisor profile';
        setError(errorMessage);
        logger.error('❌ Failed to load advisor profile for editing:', error);
      } finally {
        setLoading(false);
      }
    }

    if (!loading) {
      loadAdvisorProfile();
    }
  }, [isAuthenticated, user, router]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!advisor) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      logger.info('💾 Saving advisor profile updates', { userId: user?.id.slice(0, 8) });
      
      const updates: Partial<Advisor> = {
        display_name: formData.display_name.trim(),
        bio: formData.bio.trim(),
        avatar_url: formData.avatar_url.trim(),
        skills: formData.skills,
        specialties: formData.specialties.map(spec => ({
          key: spec.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
          label: spec
        })),
        languages: formData.languages,
        hourly_rate: formData.hourly_rate,
        years_experience: formData.years_experience,
        cal_com_event_type_url: formData.cal_com_event_type_url.trim(),
        country_code: formData.country_code,
        timezone: formData.timezone,
        availability_schedule: formData.availability_schedule.trim()
      };

      const result = await updateAdvisorProfileAction(updates);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to update profile');
      }

      setAdvisor(result.data!);
      setSuccessMessage('Profile updated successfully!');
      
      logger.info('✅ Advisor profile updated successfully');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update profile';
      setError(errorMessage);
      logger.error('❌ Failed to update advisor profile:', error);
    } finally {
      setSaving(false);
    }
  };

  // Handle skill/specialty addition
  const handleAddTag = (type: 'skills' | 'specialties', value: string) => {
    if (!value.trim()) return;
    
    setFormData(prev => ({
      ...prev,
      [type]: [...prev[type], value.trim()]
    }));
  };

  // Handle skill/specialty/language removal
  const handleRemoveTag = (type: 'skills' | 'specialties' | 'languages', index: number) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  // Show loading state
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-center h-32">
          <div className="flex flex-col items-center gap-4">
            <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{translations.common.loading}</p>
          </div>
        </div>
      </div>
    );
  }

  // Show error state
  if (error && !advisor) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="alert-circle" className="h-12 w-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Unable to load profile</h2>
            <p className="text-muted-foreground mb-6 text-center">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const avatarFallback = formData.display_name
    .split(' ')
    .map(name => name[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'AD';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">{translations.advisor.profile.title}</h1>
        <p className="text-muted-foreground">{translations.advisor.profile.subtitle}</p>
      </div>

      {/* Status Messages */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <Icon name="alert-circle" className="h-5 w-5 text-destructive" />
            <p className="text-destructive font-medium">{error}</p>
          </CardContent>
        </Card>
      )}

      {successMessage && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/50">
          <CardContent className="flex items-center gap-3 py-4">
            <Icon name="check-circle" className="h-5 w-5 text-green-600" />
            <p className="text-green-800 dark:text-green-200 font-medium">{successMessage}</p>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="user" className="h-5 w-5" />
              {translations.advisor.profile.personalInfo.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Profile Photo & Display Name */}
            <div className="flex items-start gap-6">
              <div className="flex flex-col items-center gap-3">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={formData.avatar_url} alt={formData.display_name} />
                  <AvatarFallback className="text-lg">{avatarFallback}</AvatarFallback>
                </Avatar>
                <Button variant="outline" size="sm" type="button">
                  <Icon name="camera" className="h-4 w-4 me-2" />
                  Change Photo
                </Button>
              </div>
              
              <div className="flex-1 space-y-4">
                <div>
                  <Label htmlFor="display_name">
                    {translations.advisor.profile.personalInfo.displayName}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder={translations.advisor.profile.personalInfo.displayNamePlaceholder}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="bio">{translations.advisor.profile.personalInfo.bio}</Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                    placeholder={translations.advisor.profile.personalInfo.bioPlaceholder}
                    rows={4}
                  />
                </div>
              </div>
            </div>

            {/* Languages */}
            <div>
              <Label>{translations.advisor.profile.personalInfo.languages}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.languages.map((language, index) => (
                  <Badge key={index} variant="secondary" className="gap-2">
                    {language}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag('languages', index)}
                      className="hover:text-destructive"
                    >
                      <Icon name="x" className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Select
                  onValueChange={(value) => {
                    if (value && !formData.languages.includes(value)) {
                      setFormData(prev => ({ ...prev, languages: [...prev.languages, value] }));
                    }
                  }}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Add..." />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.filter(lang => !formData.languages.includes(lang)).map((language) => (
                      <SelectItem key={language} value={language}>{language}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expertise & Skills */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="code" className="h-5 w-5" />
              {translations.advisor.profile.expertise.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Technical Skills */}
            <div>
              <Label>{translations.advisor.profile.expertise.skills}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.skills.map((skill, index) => (
                  <Badge key={index} variant="secondary" className="gap-2">
                    {skill}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag('skills', index)}
                      className="hover:text-destructive"
                    >
                      <Icon name="x" className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-3">
                {POPULAR_SKILLS.filter(skill => !formData.skills.includes(skill)).map((skill) => (
                  <Button
                    key={skill}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddTag('skills', skill)}
                    className="h-8 text-xs"
                  >
                    + {skill}
                  </Button>
                ))}
              </div>
            </div>

            {/* Specialties */}
            <div>
              <Label>{translations.advisor.profile.expertise.specialties}</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.specialties.map((specialty, index) => (
                  <Badge key={index} variant="secondary" className="gap-2">
                    {specialty}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag('specialties', index)}
                      className="hover:text-destructive"
                    >
                      <Icon name="x" className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-3">
                {POPULAR_SPECIALTIES.filter(specialty => !formData.specialties.includes(specialty)).map((specialty) => (
                  <Button
                    key={specialty}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddTag('specialties', specialty)}
                    className="h-8 text-xs justify-start"
                  >
                    + {specialty}
                  </Button>
                ))}
              </div>
            </div>

            {/* Years of Experience */}
            <div>
              <Label htmlFor="years_experience">
                {translations.advisor.profile.expertise.experience}
              </Label>
              <Input
                id="years_experience"
                type="number"
                min="0"
                max="50"
                value={formData.years_experience || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, years_experience: e.target.value ? Number(e.target.value) : null }))}
                className="max-w-32"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {translations.advisor.profile.expertise.experienceHelp}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pricing & Availability */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="dollar-sign" className="h-5 w-5" />
              {translations.advisor.profile.pricing.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Hourly Rate */}
            <div>
              <Label htmlFor="hourly_rate">
                {translations.advisor.profile.pricing.hourlyRate}
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <Input
                  id="hourly_rate"
                  type="number"
                  min="25"
                  max="1000"
                  step="5"
                  value={formData.hourly_rate || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: e.target.value ? Number(e.target.value) : null }))}
                  className="max-w-32"
                />
                <span className="text-muted-foreground">USD/hour</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {translations.advisor.profile.pricing.hourlyRateHelp}
              </p>
            </div>

            {/* Timezone */}
            <div>
              <Label htmlFor="timezone">{translations.advisor.profile.pricing.timezone}</Label>
              <Select value={formData.timezone} onValueChange={(value) => setFormData(prev => ({ ...prev, timezone: value }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Availability Schedule */}
            <div>
              <Label htmlFor="availability_schedule">{translations.advisor.profile.pricing.availability}</Label>
              <Textarea
                id="availability_schedule"
                value={formData.availability_schedule}
                onChange={(e) => setFormData(prev => ({ ...prev, availability_schedule: e.target.value }))}
                placeholder="e.g., Monday-Friday 9AM-5PM, weekends by request"
                rows={2}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {translations.advisor.profile.pricing.availabilityHelp}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Integrations */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon name="plug" className="h-5 w-5" />
              {translations.advisor.profile.integrations.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Cal.com Integration */}
            <div>
              <Label htmlFor="cal_com_event_type_url">
                {translations.advisor.profile.integrations.calcom}
              </Label>
              <Input
                id="cal_com_event_type_url"
                type="url"
                value={formData.cal_com_event_type_url}
                onChange={(e) => setFormData(prev => ({ ...prev, cal_com_event_type_url: e.target.value }))}
                placeholder={translations.advisor.profile.integrations.calcomPlaceholder}
              />
              <p className="text-sm text-muted-foreground mt-1">
                {translations.advisor.profile.integrations.calcomHelp}
              </p>
            </div>

            {/* Stripe Status */}
            <div>
              <Label>{translations.advisor.profile.integrations.stripe}</Label>
              <div className="flex items-center justify-between p-4 rounded-lg border mt-2">
                <div>
                  <p className="font-medium">{translations.advisor.profile.integrations.stripeStatus}</p>
                  <p className="text-sm text-muted-foreground">
                    {advisor?.stripe_account_id ? 'Ready to receive payments' : 'Connect to receive payments'}
                  </p>
                </div>
                {advisor?.stripe_account_id ? (
                  <Badge variant="default" className="bg-green-100 text-green-800">
                    {translations.advisor.profile.integrations.stripeConnected}
                  </Badge>
                ) : (
                  <Button variant="outline" type="button">
                    {translations.advisor.profile.integrations.connectStripe}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card>
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Icon name="loader-2" className="h-4 w-4 me-2 animate-spin" />
                    {translations.advisor.profile.actions.saving}
                  </>
                ) : (
                  translations.advisor.profile.actions.save
                )}
              </Button>
              <Button variant="outline" type="button" onClick={() => router.push('/advisor/dashboard')}>
                {translations.advisor.profile.actions.cancel}
              </Button>
            </div>
            
            {advisor?.approval_status === 'approved' && (
              <Button variant="outline" type="button" asChild>
                <a href={`/advisors/${advisor.user_id}`} target="_blank">
                  <Icon name="external-link" className="h-4 w-4 me-2" />
                  {translations.advisor.profile.actions.preview}
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}