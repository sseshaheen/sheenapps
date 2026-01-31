import { SimpleIframePreview } from '@/components/builder/preview/simple-iframe-preview'
import { QueryProvider } from '@/components/providers/query-provider'
import TestPreviewButton from './test-preview-button'

export default function TestLocalPreviewPage() {
  return (
    <QueryProvider>
      <div className="p-8">
        <h1 className="text-2xl font-bold mb-4">Local Preview Test</h1>
        <p className="text-gray-600 mb-6">
          This page tests the local preview functionality. Click the button below to create a test preview.
        </p>
        
        <div className="mb-6">
          <TestPreviewButton />
        </div>
        
        <div className="border border-gray-300 rounded-lg" style={{ height: '600px' }}>
          <SimpleIframePreview projectId="test-project" />
        </div>
      </div>
    </QueryProvider>
  )
}