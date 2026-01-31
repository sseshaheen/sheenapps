import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardProvider } from '../dashboard-context'
import { useToastWithUndo } from '@/components/ui/toast-with-undo'

// Mock the toast hook
vi.mock('@/components/ui/toast-with-undo', () => ({
  useToastWithUndo: vi.fn()
}))

// Test component that uses dashboard context
function TestComponent() {
  const { showSuccess, showError, showInfo, showWarning } = useDashboard()
  
  return (
    <div>
      <button onClick={() => showSuccess('Success', 'Description')}>
        Show Success
      </button>
      <button onClick={() => showError('Error', 'Error Description')}>
        Show Error
      </button>
      <button onClick={() => showInfo('Info', 'Info Description')}>
        Show Info
      </button>
      <button onClick={() => showWarning('Warning', 'Warning Description')}>
        Show Warning
      </button>
      <button 
        onClick={() => showSuccess(
          'With Undo', 
          'Can be undone', 
          () => console.log('Undo action'),
          'test-action',
          ['project-1']
        )}
      >
        Show With Undo
      </button>
    </div>
  )
}

describe('Dashboard Toast Integration', () => {
  const mockToastHandlers = {
    showSuccessWithUndo: vi.fn().mockReturnValue('toast-id'),
    showSuccess: vi.fn().mockReturnValue('toast-id'),
    showError: vi.fn().mockReturnValue('toast-id'),
    showInfo: vi.fn().mockReturnValue('toast-id'),
    showWarning: vi.fn().mockReturnValue('toast-id')
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useToastWithUndo).mockReturnValue(mockToastHandlers)
  })

  it('provides toast functions through context', () => {
    render(
      <DashboardProvider
        translations={{}}
        locale="en"
        toastHandlers={{
          success: mockToastHandlers.showSuccess,
          error: mockToastHandlers.showError,
          info: mockToastHandlers.showInfo,
          warning: mockToastHandlers.showWarning
        }}
      >
        <TestComponent />
      </DashboardProvider>
    )

    expect(screen.getByText('Show Success')).toBeInTheDocument()
    expect(screen.getByText('Show Error')).toBeInTheDocument()
    expect(screen.getByText('Show Info')).toBeInTheDocument()
    expect(screen.getByText('Show Warning')).toBeInTheDocument()
  })

  it('calls success toast handler', async () => {
    const user = userEvent.setup()
    
    render(
      <DashboardProvider
        translations={{}}
        locale="en"
        toastHandlers={{
          success: mockToastHandlers.showSuccess,
          error: mockToastHandlers.showError,
          info: mockToastHandlers.showInfo,
          warning: mockToastHandlers.showWarning
        }}
      >
        <TestComponent />
      </DashboardProvider>
    )

    await user.click(screen.getByText('Show Success'))

    expect(mockToastHandlers.showSuccess).toHaveBeenCalledWith('Success', 'Description')
  })

  it('calls error toast handler', async () => {
    const user = userEvent.setup()
    
    render(
      <DashboardProvider
        translations={{}}
        locale="en"
        toastHandlers={{
          success: mockToastHandlers.showSuccess,
          error: mockToastHandlers.showError,
          info: mockToastHandlers.showInfo,
          warning: mockToastHandlers.showWarning
        }}
      >
        <TestComponent />
      </DashboardProvider>
    )

    await user.click(screen.getByText('Show Error'))

    expect(mockToastHandlers.showError).toHaveBeenCalledWith('Error', 'Error Description')
  })

  it('calls info toast handler', async () => {
    const user = userEvent.setup()
    
    render(
      <DashboardProvider
        translations={{}}
        locale="en"
        toastHandlers={{
          success: mockToastHandlers.showSuccess,
          error: mockToastHandlers.showError,
          info: mockToastHandlers.showInfo,
          warning: mockToastHandlers.showWarning
        }}
      >
        <TestComponent />
      </DashboardProvider>
    )

    await user.click(screen.getByText('Show Info'))

    expect(mockToastHandlers.showInfo).toHaveBeenCalledWith('Info', 'Info Description')
  })

  it('calls warning toast handler', async () => {
    const user = userEvent.setup()
    
    render(
      <DashboardProvider
        translations={{}}
        locale="en"
        toastHandlers={{
          success: mockToastHandlers.showSuccess,
          error: mockToastHandlers.showError,
          info: mockToastHandlers.showInfo,
          warning: mockToastHandlers.showWarning
        }}
      >
        <TestComponent />
      </DashboardProvider>
    )

    await user.click(screen.getByText('Show Warning'))

    expect(mockToastHandlers.showWarning).toHaveBeenCalledWith('Warning', 'Warning Description')
  })

  it('calls success with undo handler', async () => {
    const user = userEvent.setup()
    
    render(
      <DashboardProvider
        translations={{}}
        locale="en"
        toastHandlers={{
          success: mockToastHandlers.showSuccess,
          error: mockToastHandlers.showError,
          info: mockToastHandlers.showInfo,
          warning: mockToastHandlers.showWarning
        }}
      >
        <TestComponent />
      </DashboardProvider>
    )

    await user.click(screen.getByText('Show With Undo'))

    expect(mockToastHandlers.showSuccess).toHaveBeenCalledWith(
      'With Undo',
      'Can be undone',
      expect.any(Function),
      'test-action',
      ['project-1']
    )
  })

  it('returns toast ID from handlers', async () => {
    const user = userEvent.setup()
    const testToastId = 'custom-toast-id'
    mockToastHandlers.showSuccess.mockReturnValueOnce(testToastId)
    
    let capturedId: string | undefined
    
    function CaptureComponent() {
      const { showSuccess } = useDashboard()
      
      return (
        <button onClick={() => {
          capturedId = showSuccess('Test', 'Test')
        }}>
          Capture ID
        </button>
      )
    }
    
    render(
      <DashboardProvider
        translations={{}}
        locale="en"
        toastHandlers={{
          success: mockToastHandlers.showSuccess,
          error: mockToastHandlers.showError,
          info: mockToastHandlers.showInfo,
          warning: mockToastHandlers.showWarning
        }}
      >
        <CaptureComponent />
      </DashboardProvider>
    )

    await user.click(screen.getByText('Capture ID'))

    expect(capturedId).toBe(testToastId)
  })
})

// Also need to import useDashboard in the test component
import { useDashboard } from '../dashboard-context'