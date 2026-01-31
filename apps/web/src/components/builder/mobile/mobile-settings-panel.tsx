'use client'

import React from 'react'
import { MobilePanel } from '../workspace/mobile-workspace-layout'

export function MobileSettingsPanel() {
  return (
    <MobilePanel id="settings" className="bg-gray-900">
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h3 className="text-white font-medium">Settings & More</h3>
        </div>

        <div className="flex-1 p-4">
          <div className="space-y-4">
            {/* Quick actions */}
            <div className="space-y-3">
              <button className="w-full p-4 bg-gray-800 rounded-lg text-left hover:bg-gray-700 transition-colors">
                <div className="font-medium text-white">Project Settings</div>
                <div className="text-sm text-gray-400">Customize your project</div>
              </button>

              <button className="w-full p-4 bg-gray-800 rounded-lg text-left hover:bg-gray-700 transition-colors">
                <div className="font-medium text-white">Export Options</div>
                <div className="text-sm text-gray-400">Download or deploy</div>
              </button>

              <button className="w-full p-4 bg-gray-800 rounded-lg text-left hover:bg-gray-700 transition-colors">
                <div className="font-medium text-white">Help & Support</div>
                <div className="text-sm text-gray-400">Get assistance</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </MobilePanel>
  )
}