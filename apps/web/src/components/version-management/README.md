# Version Management Components

This directory contains all components related to project version management, publishing, and status tracking.

## Architecture

### Core Principles
- **Accessibility First**: All components support screen readers and keyboard navigation
- **Mobile Optimized**: Responsive design with touch-friendly interactions  
- **Type Safe**: Full TypeScript support with comprehensive type definitions
- **Performance**: Optimized with React Query caching and lazy loading

### Component Categories

#### 1. Status Display Components
- `StatusBadge` - Accessible status indicator with color + text + icons
- `StatusBadgeWithTooltip` - Enhanced status badge with detailed tooltips
- `StatusTimeline` - Timeline view of version history
- `BulkStatusDisplay` - Bulk operations on multiple versions

#### 2. Publishing Components  
- `QuickPublishPanel` - Contextual publishing interface with change summaries
- `VersionStatusBadge` - Compact status display for workspace header

#### 3. Progress & Operations
- `RollbackProgressPanel` - Two-phase rollback progress tracking

## Usage Examples

### Basic Status Display
```tsx
import { StatusBadge } from '@/components/version-management'

<StatusBadge 
  status="draft" 
  size="sm" 
  showIcon={true}
  showText={true}
/>
```

### Workspace Integration
```tsx
import { VersionStatusBadge } from '@/components/version-management'

<VersionStatusBadge 
  projectId={projectId}
  className="ml-4"
/>
```

### Publishing Panel
```tsx
import { QuickPublishPanel } from '@/components/version-management'

<QuickPublishPanel
  projectId={projectId}
  onPublishSuccess={() => console.log('Published!')}
  variant="compact"
/>
```

## Component Locations

Currently transitioning to proper organization:

### Current (Legacy)
- `/components/ui/accessible-status-badge.tsx` → **Move to** `/components/version-management/status-badge.tsx`
- `/components/builder/quick-publish-panel.tsx` → **Move to** `/components/version-management/quick-publish-panel.tsx`
- `/components/builder/rollback-progress-panel.tsx` → **Move to** `/components/version-management/rollback-progress-panel.tsx`

### Target Structure
```
src/components/version-management/
├── index.ts                    # Clean exports
├── README.md                   # This file
├── status-badge.tsx           # Core status display
├── quick-publish-panel.tsx    # Publishing interface
├── rollback-progress-panel.tsx # Rollback operations
├── version-status-badge.tsx   # Workspace integration
└── version-history-panel.tsx  # Full history view (future)
```

## Integration Points

### Workspace Headers
- Desktop: `WorkspaceHeader` includes `VersionStatusBadge` 
- Mobile: `MobileWorkspaceHeader` includes compact version display

### Builder Interface
- Chat interface includes publishing recommendations
- Build progress shows version creation status

### Dashboard
- Project cards show current version status
- Bulk operations for multiple projects

## State Management

Uses `useVersionManagement` hook for:
- Version queries via React Query
- Publishing mutations
- Rollback operations
- Status tracking

## Future Improvements

1. **Component Migration**: Move all components to `/version-management/` directory
2. **Unified Naming**: Standardize component names (remove "Accessible" prefix)
3. **Enhanced Integration**: Connect to real version management API
4. **Performance**: Add more granular loading states
5. **Testing**: Comprehensive component test coverage