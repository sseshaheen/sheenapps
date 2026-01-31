'use client'

import { useState, useRef } from 'react'

export default function TestPreviewButton() {
  const [isLoading, setIsLoading] = useState(false)
  // Ref to prevent double-submission race conditions
  const isProcessingRef = useRef(false)
  const handleCreatePreview = async () => {
    // Multi-layer double-submission prevention
    if (isLoading || isProcessingRef.current) return
    
    isProcessingRef.current = true
    setIsLoading(true)
    const testTemplate = {
      name: 'Test Template',
      files: [
        {
          path: 'src/App.tsx',
          content: `import React from 'react'

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
      <div className="text-center text-white">
        <h1 className="text-4xl font-bold mb-4">🎉 Local Preview Works!</h1>
        <p className="text-xl mb-6">This is a test template built locally</p>
        <div className="bg-white bg-opacity-20 rounded-lg p-6">
          <p className="text-lg">
            Generated at: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  )
}`
        }
      ]
    }

    try {
      const response = await fetch('/api/projects/test-project/deploy-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testTemplate),
      })

      const result = await response.json()
      console.log('Preview deployment result:', result)
      
      if (result.success) {
        alert(`Preview created successfully! URL: ${result.previewUrl}`)
      } else {
        alert(`Preview failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Preview deployment error:', error)
      alert('Preview deployment failed')
    } finally {
      // Always cleanup state in finally block
      setIsLoading(false)
      isProcessingRef.current = false
    }
  }

  return (
    <button
      onClick={handleCreatePreview}
      disabled={isLoading}
      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
    >
      {isLoading ? 'Creating...' : 'Create Test Preview'}
    </button>
  )
}