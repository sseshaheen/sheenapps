# Career Portal Frontend Integration Guide

## Overview

This guide provides the frontend team with everything needed to integrate the Career Portal APIs into the Next.js application. The backend implementation is complete and ready for integration.

## API Endpoints

### Base Configuration

```typescript
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://worker.sheenapps.com';

// Include locale header for all API calls
const apiCall = async (endpoint: string, options: RequestInit = {}) => {
  const locale = getCurrentLocale(); // 'ar' or 'en'

  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'x-sheen-locale': locale, // IMPORTANT: Use x-sheen-locale, not x-locale
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
};
```

## Public API Endpoints

### 1. List Jobs
**GET** `/api/careers/jobs`

Query Parameters:
- `search` (string): Trigram text search across title, description, requirements
- `department` (string): Filter by department
- `location` (string): Filter by location (searches both ar and en)
- `employment_type` (string): `full_time`, `part_time`, `contract`, `internship`
- `experience_level` (string): `entry`, `mid`, `senior`, `executive`
- `is_remote` (boolean): Filter remote-friendly jobs
- `limit` (number): Items per page (default: 20, max: 100)
- `offset` (number): Pagination offset (default: 0)

Response:
```typescript
interface JobListResponse {
  items: Job[];
  total: number;
  limit: number;
  offset: number;
}

interface Job {
  id: string;
  slug: string;
  title: string;          // Localized based on x-sheen-locale
  description: string;    // Localized HTML content
  requirements: string;   // Localized HTML content
  benefits: string;       // Localized HTML content
  location: string;       // Localized
  department: string;
  employment_type: string;
  experience_level: string;
  salary_range?: string;  // Localized
  posted_at: string;      // ISO date
  application_deadline?: string; // ISO date
  is_remote: boolean;
  is_featured: boolean;
}
```

### 2. Get Single Job
**GET** `/api/careers/jobs/:slug`

Response includes full job details plus JSON-LD for SEO:
```typescript
interface JobDetailResponse {
  success: boolean;
  job: Job; // Full job object with all fields
  jsonLd: object; // Structured data for SEO
}
```

### 3. Submit Application
**POST** `/api/careers/jobs/:id/apply`

Request Body:
```typescript
interface ApplicationRequest {
  full_name: string;
  email: string;
  phone: string;
  cover_letter?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  years_of_experience?: number;
  resume_file?: string; // Base64 encoded file data (data:mime;base64,...)
  captcha_token: string; // reCAPTCHA token
}
```

Response:
```typescript
interface ApplicationResponse {
  success: boolean;
  application_id: string;
  message: string;
}
```

Error Responses:
- `400`: Invalid data
- `404`: Job not found or no longer accepting applications
- `409`: Duplicate application
- `422`: CAPTCHA verification failed
- `429`: Rate limit exceeded (5 applications/hour/IP/job)

### 4. List Departments
**GET** `/api/careers/departments`

Response:
```typescript
interface DepartmentsResponse {
  success: boolean;
  departments: Array<{
    department: string;
    job_count: number;
  }>;
}
```

### 5. Get Sitemap Data
**GET** `/api/careers/sitemap`

Response:
```typescript
interface SitemapResponse {
  success: boolean;
  urls: Array<{
    loc: string;
    lastmod: string;
    changefreq: string;
    priority: number;
  }>;
}
```

## Implementation Examples

### Job Listing Page

```tsx
// app/careers/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface Job {
  id: string;
  slug: string;
  title: string;
  description: string;
  location: string;
  department: string;
  employment_type: string;
  experience_level: string;
  salary_range?: string;
  posted_at: string;
  application_deadline?: string;
  is_remote: boolean;
  is_featured: boolean;
}

export default function CareersPage() {
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: 20,
    offset: 0
  });

  useEffect(() => {
    const fetchJobs = async () => {
      setLoading(true);

      const params = new URLSearchParams();

      // Add search params
      const search = searchParams.get('search');
      if (search) params.append('search', search);

      const department = searchParams.get('department');
      if (department) params.append('department', department);

      params.append('limit', '20');
      params.append('offset', String(pagination.offset));

      try {
        const response = await fetch(`/api/careers/jobs?${params}`, {
          headers: {
            'x-sheen-locale': localStorage.getItem('locale') || 'ar'
          }
        });

        const data = await response.json();
        setJobs(data.items);
        setPagination({
          total: data.total,
          limit: data.limit,
          offset: data.offset
        });
      } catch (error) {
        console.error('Failed to fetch jobs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchJobs();
  }, [searchParams, pagination.offset]);

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">
        {/* Localized heading */}
        {localStorage.getItem('locale') === 'ar' ? 'الوظائف المتاحة' : 'Available Jobs'}
      </h1>

      {/* Search Bar */}
      <div className="mb-6">
        <input
          type="text"
          placeholder={localStorage.getItem('locale') === 'ar' ? 'ابحث عن وظيفة...' : 'Search jobs...'}
          className="w-full p-3 border rounded-lg"
          defaultValue={searchParams.get('search') || ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const value = (e.target as HTMLInputElement).value;
              const params = new URLSearchParams(searchParams);
              if (value) {
                params.set('search', value);
              } else {
                params.delete('search');
              }
              window.location.href = `/careers?${params}`;
            }
          }}
        />
      </div>

      {/* Job Grid */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="border rounded-lg p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {jobs.map(job => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="mt-8 flex justify-center gap-2">
          <button
            disabled={pagination.offset === 0}
            onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 py-2">
            Page {Math.floor(pagination.offset / pagination.limit) + 1} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <button
            disabled={pagination.offset + pagination.limit >= pagination.total}
            onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
            className="px-4 py-2 border rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: Job }) {
  return (
    <a href={`/careers/${job.slug}`} className="block border rounded-lg p-4 hover:shadow-lg transition">
      {job.is_featured && (
        <span className="inline-block px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded mb-2">
          Featured
        </span>
      )}
      <h2 className="text-xl font-semibold mb-2">{job.title}</h2>
      <p className="text-gray-600 mb-2">{job.department}</p>
      <p className="text-sm text-gray-500">
        {job.location} {job.is_remote && '• Remote OK'}
      </p>
      <p className="text-sm text-gray-500 mt-2">
        {new Date(job.posted_at).toLocaleDateString()}
      </p>
    </a>
  );
}
```

### Job Application Form with CAPTCHA

```tsx
// components/ApplicationForm.tsx
import { useState } from 'react';
import ReCAPTCHA from 'react-google-recaptcha';

interface ApplicationFormProps {
  jobId: string;
  jobTitle: string;
  onSuccess?: () => void;
}

export function ApplicationForm({ jobId, jobTitle, onSuccess }: ApplicationFormProps) {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    cover_letter: '',
    linkedin_url: '',
    portfolio_url: '',
    years_of_experience: '',
    resume_file: null as File | null,
    captcha_token: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type and size
      const allowedTypes = ['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

      if (!allowedTypes.includes(file.type)) {
        setErrors({ ...errors, resume_file: 'Only PDF, DOC, and DOCX files are allowed' });
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setErrors({ ...errors, resume_file: 'File size must be less than 5MB' });
        return;
      }

      setFormData({ ...formData, resume_file: file });
      setErrors({ ...errors, resume_file: '' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (!formData.full_name) newErrors.full_name = 'Name is required';
    if (!formData.email) newErrors.email = 'Email is required';
    if (!formData.phone) newErrors.phone = 'Phone is required';
    if (!formData.captcha_token) newErrors.captcha = 'Please complete the CAPTCHA';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setSubmitting(true);

    try {
      // Convert file to base64 if present
      let resume_file_base64 = '';
      if (formData.resume_file) {
        const reader = new FileReader();
        resume_file_base64 = await new Promise((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(formData.resume_file!);
        });
      }

      const response = await fetch(`/api/careers/jobs/${jobId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-sheen-locale': localStorage.getItem('locale') || 'ar'
        },
        body: JSON.stringify({
          ...formData,
          resume_file: resume_file_base64,
          years_of_experience: formData.years_of_experience ?
            parseInt(formData.years_of_experience) : undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setErrors({ submit: 'You have already applied for this position' });
        } else if (response.status === 429) {
          setErrors({ submit: 'Too many applications. Please try again later.' });
        } else if (response.status === 422) {
          setErrors({ captcha: 'CAPTCHA verification failed. Please try again.' });
        } else {
          setErrors({ submit: data.error || 'Application failed' });
        }
        return;
      }

      // Success
      alert('Application submitted successfully!');
      onSuccess?.();

    } catch (error) {
      setErrors({ submit: 'Network error. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-2xl font-bold mb-4">Apply for {jobTitle}</h2>

      {errors.submit && (
        <div className="p-3 bg-red-100 text-red-700 rounded">
          {errors.submit}
        </div>
      )}

      <div>
        <label className="block mb-1">Full Name *</label>
        <input
          type="text"
          value={formData.full_name}
          onChange={e => setFormData({ ...formData, full_name: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
        {errors.full_name && <span className="text-red-500 text-sm">{errors.full_name}</span>}
      </div>

      <div>
        <label className="block mb-1">Email *</label>
        <input
          type="email"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
        {errors.email && <span className="text-red-500 text-sm">{errors.email}</span>}
      </div>

      <div>
        <label className="block mb-1">Phone *</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={e => setFormData({ ...formData, phone: e.target.value })}
          className="w-full p-2 border rounded"
          required
        />
        {errors.phone && <span className="text-red-500 text-sm">{errors.phone}</span>}
      </div>

      <div>
        <label className="block mb-1">Years of Experience</label>
        <input
          type="number"
          min="0"
          max="50"
          value={formData.years_of_experience}
          onChange={e => setFormData({ ...formData, years_of_experience: e.target.value })}
          className="w-full p-2 border rounded"
        />
      </div>

      <div>
        <label className="block mb-1">Cover Letter</label>
        <textarea
          value={formData.cover_letter}
          onChange={e => setFormData({ ...formData, cover_letter: e.target.value })}
          className="w-full p-2 border rounded"
          rows={4}
        />
      </div>

      <div>
        <label className="block mb-1">Resume/CV (PDF, DOC, DOCX - Max 5MB)</label>
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={handleFileChange}
          className="w-full p-2 border rounded"
        />
        {errors.resume_file && <span className="text-red-500 text-sm">{errors.resume_file}</span>}
      </div>

      <div>
        <label className="block mb-1">LinkedIn URL</label>
        <input
          type="url"
          value={formData.linkedin_url}
          onChange={e => setFormData({ ...formData, linkedin_url: e.target.value })}
          className="w-full p-2 border rounded"
          placeholder="https://linkedin.com/in/..."
        />
      </div>

      <div>
        <label className="block mb-1">Portfolio URL</label>
        <input
          type="url"
          value={formData.portfolio_url}
          onChange={e => setFormData({ ...formData, portfolio_url: e.target.value })}
          className="w-full p-2 border rounded"
          placeholder="https://..."
        />
      </div>

      <div>
        <ReCAPTCHA
          sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
          onChange={(token) => setFormData({ ...formData, captcha_token: token || '' })}
        />
        {errors.captcha && <span className="text-red-500 text-sm">{errors.captcha}</span>}
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? 'Submitting...' : 'Submit Application'}
      </button>
    </form>
  );
}
```

## Admin Panel Integration

For admin panel integration, all endpoints require admin authentication via HMAC signature. The admin routes are:

- **GET** `/api/admin/careers/jobs` - List all jobs with filters
- **GET** `/api/admin/careers/jobs/:id` - Get job details
- **POST** `/api/admin/careers/jobs` - Create new job
- **PUT** `/api/admin/careers/jobs/:id` - Update job
- **DELETE** `/api/admin/careers/jobs/:id` - Soft delete job
- **GET** `/api/admin/careers/applications` - List applications
- **GET** `/api/admin/careers/applications/:id` - Get application details
- **PUT** `/api/admin/careers/applications/:id/status` - Update application status
- **GET** `/api/admin/careers/stats` - Get statistics

Admin requests require:
- `x-admin-user-id` header
- `x-admin-reason` header (optional but recommended for audit)
- HMAC signature validation

## Important Notes

1. **Locale Header**: Always use `x-sheen-locale`, not `x-locale`
2. **Arabic First**: All multilingual fields require Arabic content
3. **HTML Content**: Job descriptions, requirements, and benefits contain sanitized HTML
4. **Rate Limiting**: Applications are rate-limited to 5 per hour per IP per job
5. **File Upload**: Resume files should be base64 encoded in the request body
6. **CAPTCHA**: Required for all applications to prevent spam
7. **Trigram Search**: The search uses PostgreSQL trigram matching for fuzzy search

## SEO Considerations

The job detail endpoint returns JSON-LD structured data that should be included in the page's `<head>`:

```tsx
// In your job detail page
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const res = await fetch(`${API_BASE_URL}/api/careers/jobs/${params.slug}`);
  const data = await res.json();

  return {
    title: data.job.title,
    description: data.job.description.substring(0, 160),
    other: {
      'application-ld+json': JSON.stringify(data.jsonLd)
    }
  };
}
```

## Error Handling

All API errors follow this format:
```typescript
interface ApiError {
  success: false;
  error: string;
  errorCodes?: string[]; // For CAPTCHA errors
  details?: any[]; // For validation errors
}
```

Handle errors appropriately based on status codes:
- `400`: Validation error - show field-specific errors
- `404`: Resource not found
- `409`: Conflict - duplicate application
- `422`: CAPTCHA verification failed
- `429`: Rate limit exceeded
- `500`: Server error - show generic error message
