'use client'

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store';
import { useRouter } from '@/i18n/routing';
import { AdvisorAPIService, type ProfessionalData } from '@/services/advisor-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { AdvisorApplicationRequest } from '@/types/advisor-network';
import { logger } from '@/utils/logger';

interface AdvisorApplicationFormProps {
  translations: {
    advisor: {
      application: {
        title: string;
        subtitle: string;
        form: {
          displayName: { label: string; placeholder: string; help: string; };
          bio: { label: string; placeholder: string; help: string; };
          skills: { label: string; placeholder: string; help: string; };
          specialties: { label: string; help: string; };
          languages: { label: string; help: string; };
          portfolio: { label: string; placeholder: string; help: string; };
          experience: { label: string; help: string; };
          submit: string;
          submitting: string;
        };
        success: {
          title: string;
          description: string;
          nextSteps: string;
          steps: string[];
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

export function AdvisorApplicationForm({ translations, locale }: AdvisorApplicationFormProps) {
  const { user, isAuthenticated } = useAuthStore();
  const router = useRouter();
  
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    display_name: '',
    bio: '',
    skills: [] as string[],
    specialties: [] as string[],
    languages: [] as string[],
    portfolio_url: '',
    years_experience: null as number | null
  });

  // Redirect if not authenticated
  useEffect(() => {
    if (!isAuthenticated && user === null) {
      router.push('/auth/login?redirect=/advisor/apply');
    }
  }, [isAuthenticated, user, router]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isAuthenticated || !user) {
      router.push('/auth/login?redirect=/advisor/apply');
      return;
    }

    // Basic validation
    if (!formData.display_name.trim() || !formData.bio.trim()) {
      setError('Display name and bio are required');
      return;
    }

    if (formData.skills.length === 0) {
      setError('Please add at least one technical skill');
      return;
    }

    if (formData.specialties.length === 0) {
      setError('Please select at least one area of expertise');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      logger.info('📝 Submitting advisor application', { userId: user.id.slice(0, 8) });
      
      // Convert form data to ProfessionalData format
      const professionalData: Partial<ProfessionalData> = {
        bio: formData.bio?.trim() || '',
        skills: formData.skills || [],
        specialties: formData.specialties || [],
        languages: formData.languages || [],
        yearsExperience: formData.years_experience || 0,
        portfolioUrl: formData.portfolio_url?.trim() || undefined,
        isComplete: true,
        completedSections: ['basic', 'experience'] // Mark sections as complete
      };

      // Save draft first, then submit
      await AdvisorAPIService.saveDraft(professionalData, user.id);
      const result = await AdvisorAPIService.submitApplication(user.id);
      
      setSubmitted(true);
      logger.info('✅ Advisor application submitted successfully', { 
        userId: user.id.slice(0, 8) 
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit application';
      setError(errorMessage);
      logger.error('❌ Failed to submit advisor application:', error);
    } finally {
      setSubmitting(false);
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

  // Handle skill/specialty removal
  const handleRemoveTag = (type: 'skills' | 'specialties', index: number) => {
    setFormData(prev => ({
      ...prev,
      [type]: prev[type].filter((_, i) => i !== index)
    }));
  };

  // Show loading state for authentication
  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Icon name="loader-2" className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{translations.common.loading}</p>
        </div>
      </div>
    );
  }

  // Show success state
  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardContent className="flex flex-col items-center text-center py-12">
                <div className="rounded-full bg-green-100 p-4 mb-6">
                  <Icon name="check-circle" className="h-12 w-12 text-green-600" />
                </div>
                
                <h1 className="text-2xl font-bold mb-4">{translations.advisor.application.success.title}</h1>
                <p className="text-muted-foreground mb-8 max-w-md">
                  {translations.advisor.application.success.description}
                </p>

                <div className="w-full max-w-md text-left">
                  <h3 className="font-semibold mb-4">{translations.advisor.application.success.nextSteps}</h3>
                  <ol className="space-y-3">
                    {translations.advisor.application.success.steps.map((step, index) => (
                      <li key={index} className="flex gap-3">
                        <div className="rounded-full bg-primary text-primary-foreground text-sm w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                          {index + 1}
                        </div>
                        <span className="text-sm text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="flex gap-4 mt-8">
                  <Button variant="outline" onClick={() => router.push('/dashboard')}>
                    Back to Dashboard
                  </Button>
                  <Button onClick={() => router.push('/advisors')}>
                    Browse Advisors
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight mb-4">
              {translations.advisor.application.title}
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              {translations.advisor.application.subtitle}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="flex items-center gap-3 py-4">
                <Icon name="alert-circle" className="h-5 w-5 text-destructive" />
                <p className="text-destructive font-medium">{error}</p>
              </CardContent>
            </Card>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Personal Information */}
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
                <CardDescription>
                  Tell us about yourself and your professional background
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Display Name */}
                <div>
                  <Label htmlFor="display_name">
                    {translations.advisor.application.form.displayName.label}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Input
                    id="display_name"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                    placeholder={translations.advisor.application.form.displayName.placeholder}
                    required
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {translations.advisor.application.form.displayName.help}
                  </p>
                </div>

                {/* Professional Bio */}
                <div>
                  <Label htmlFor="bio">
                    {translations.advisor.application.form.bio.label}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <Textarea
                    id="bio"
                    value={formData.bio}
                    onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                    placeholder={translations.advisor.application.form.bio.placeholder}
                    rows={4}
                    required
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {translations.advisor.application.form.bio.help}
                  </p>
                </div>

                {/* Years of Experience */}
                <div>
                  <Label htmlFor="years_experience">
                    {translations.advisor.application.form.experience.label}
                  </Label>
                  <Input
                    id="years_experience"
                    type="number"
                    min="0"
                    max="50"
                    value={formData.years_experience || ''}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      years_experience: e.target.value ? Number(e.target.value) : null 
                    }))}
                    className="max-w-32"
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {translations.advisor.application.form.experience.help}
                  </p>
                </div>

                {/* Portfolio URL */}
                <div>
                  <Label htmlFor="portfolio_url">
                    {translations.advisor.application.form.portfolio.label}
                  </Label>
                  <Input
                    id="portfolio_url"
                    type="url"
                    value={formData.portfolio_url}
                    onChange={(e) => setFormData(prev => ({ ...prev, portfolio_url: e.target.value }))}
                    placeholder={translations.advisor.application.form.portfolio.placeholder}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    {translations.advisor.application.form.portfolio.help}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Skills & Expertise */}
            <Card>
              <CardHeader>
                <CardTitle>Skills & Expertise</CardTitle>
                <CardDescription>
                  Help clients find you by showcasing your technical skills and areas of expertise
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Technical Skills */}
                <div>
                  <Label>
                    {translations.advisor.application.form.skills.label}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2 mt-2 mb-3">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
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
                  <p className="text-sm text-muted-foreground mt-2">
                    {translations.advisor.application.form.skills.help}
                  </p>
                </div>

                {/* Specialties */}
                <div>
                  <Label>
                    {translations.advisor.application.form.specialties.label}
                    <span className="text-destructive ml-1">*</span>
                  </Label>
                  <div className="flex flex-wrap gap-2 mt-2 mb-3">
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
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
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
                  <p className="text-sm text-muted-foreground mt-2">
                    {translations.advisor.application.form.specialties.help}
                  </p>
                </div>

                {/* Languages */}
                <div>
                  <Label>{translations.advisor.application.form.languages.label}</Label>
                  <div className="flex flex-wrap gap-2 mt-2 mb-3">
                    {formData.languages.map((language, index) => (
                      <Badge key={index} variant="secondary" className="gap-2">
                        {language}
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              languages: prev.languages.filter((_, i) => i !== index)
                            }));
                          }}
                          className="hover:text-destructive"
                        >
                          <Icon name="x" className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <Select
                    onValueChange={(value) => {
                      if (value && !formData.languages.includes(value)) {
                        setFormData(prev => ({ ...prev, languages: [...prev.languages, value] }));
                      }
                    }}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Add language..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.filter(lang => !formData.languages.includes(lang)).map((language) => (
                        <SelectItem key={language} value={language}>{language}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground mt-2">
                    {translations.advisor.application.form.languages.help}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <Card>
              <CardContent className="flex items-center justify-between py-6">
                <div className="text-sm text-muted-foreground">
                  All fields marked with <span className="text-destructive">*</span> are required
                </div>
                
                <div className="flex gap-3">
                  <Button variant="outline" type="button" onClick={() => router.push('/dashboard')}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <>
                        <Icon name="loader-2" className="h-4 w-4 me-2 animate-spin" />
                        {translations.advisor.application.form.submitting}
                      </>
                    ) : (
                      translations.advisor.application.form.submit
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>
    </div>
  );
}