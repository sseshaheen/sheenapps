export interface Recommendation {
  id: number;
  title: string;
  description: string;
  category: string;
  complexity: 'easy' | 'medium' | 'hard';
  impact: 'low' | 'medium' | 'high';
  versionHint: 'patch' | 'minor' | 'major';
  prompt: string;
}

// Note: Using `| undefined` allows explicit undefined assignment (exactOptionalPropertyTypes)
export interface RecommendationsResponse {
  success: boolean;
  buildId?: string | undefined;
  projectId?: string | undefined;
  versionId?: string | undefined;
  recommendations: Recommendation[];
  message?: string | undefined;
  _i18n?: {
    locale: string;
    localeTag?: string | undefined;
    available: string[];
  } | undefined;
}