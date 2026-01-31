import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { NewProjectPage } from '@/components/builder/new-project-page'

// Mock next/navigation
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush
  }),
  usePathname: () => '/en/builder/new'
}))

// Mock auth store
vi.mock('@/store', () => ({
  useAuthStore: () => ({
    user: { id: 'test-user', plan: 'free' },
    isAuthenticated: true,
    sessionLimits: { maxGenerations: 10 },
    canPerformAction: () => true,
    requestUpgrade: vi.fn(),
    logout: vi.fn()
  })
}))

// Mock fetch
global.fetch = vi.fn()

const mockTranslations = {
  builder: {
    newProject: {
      title: 'Start Building Your Business',
      subtitle: 'Describe your business idea',
      placeholder: "What's your business idea?",
      examples: ['Example 1', 'Example 2'],
      startBuilding: 'Start Building',
      useVoice: 'Use voice',
      uploadFiles: 'Upload files'
    },
    templates: {
      title: 'Templates',
      subtitle: 'Choose a template',
      viewAll: 'View all'
    }
  },
  common: {
    loading: 'Loading...',
    error: 'Error',
    retry: 'Retry'
  }
}

describe('Project Creation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create project before redirecting to workspace', async () => {
    const mockProject = {
      id: 'test-project-id',
      name: 'Test Project',
      config: { businessIdea: 'Test business idea' }
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, project: mockProject })
    })

    render(
      <NewProjectPage 
        translations={mockTranslations} 
        locale="en" 
      />
    )

    // Find and fill the business idea textarea
    const textarea = screen.getByPlaceholderText("What's your business idea?")
    fireEvent.change(textarea, { target: { value: 'Test business idea' } })

    // Click start building button
    const startButton = screen.getByText('Start Building')
    fireEvent.click(startButton)

    // Verify API call was made
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/en/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          businessIdea: 'Test business idea'
        })
      })
    })

    // Verify redirect happened without query params
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/builder/workspace/test-project-id')
    })
  })

  it('should handle API errors gracefully', async () => {
    ;(global.fetch as any).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ 
        success: false, 
        error: 'Failed to create project',
        code: 'INTERNAL_ERROR'
      })
    })

    render(
      <NewProjectPage 
        translations={mockTranslations} 
        locale="en" 
      />
    )

    // Fill and submit
    const textarea = screen.getByPlaceholderText("What's your business idea?")
    fireEvent.change(textarea, { target: { value: 'Test business idea' } })
    
    const startButton = screen.getByText('Start Building')
    fireEvent.click(startButton)

    // Verify no redirect happened
    await waitFor(() => {
      expect(mockPush).not.toHaveBeenCalled()
    })

    // TODO: Once error toast is implemented, verify it shows
  })

  it('should create project from template selection', async () => {
    const mockProject = {
      id: 'template-project-id',
      name: 'E-commerce Store',
      config: { templateId: 'ecommerce' }
    }

    ;(global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, project: mockProject })
    })

    render(
      <NewProjectPage 
        translations={mockTranslations} 
        locale="en" 
      />
    )

    // Click on a template card
    const templateCard = screen.getByText('E-commerce Store')
    fireEvent.click(templateCard)

    // Verify API call was made with template
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/en/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          templateId: 'ecommerce',
          name: 'E-commerce Store'
        })
      })
    })

    // Verify redirect
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/en/builder/workspace/template-project-id')
    })
  })
})