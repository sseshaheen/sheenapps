/**
 * 🗂️ Server Repository Index
 * 
 * Phase 2.4: Repository Pattern - Clean Imports
 * Centralized exports for all server-only repositories
 * 
 * USAGE:
 * import { ProjectRepository } from '@/lib/server/repositories'
 * import { ProjectRepository, OrganizationRepository } from '@/lib/server/repositories'
 * 
 * SECURITY: All imports are server-only (import 'server-only' in each file)
 */

// ====================================
// ACTIVE REPOSITORIES (PRODUCTION READY)
// ====================================

export { ProjectRepository } from './project-repository'
export type { 
  Project, 
  ProjectInsert, 
  ProjectUpdate, 
  CreateProjectData, 
  UpdateProjectData 
} from './project-repository'

// ====================================
// FUTURE REPOSITORIES (INACTIVE)
// ====================================

export { OrganizationRepository } from './organization-repository'
export type { 
  Organization, 
  OrganizationInsert, 
  OrganizationUpdate, 
  OrganizationMember,
  CreateOrganizationData, 
  UpdateOrganizationData,
  InviteMemberData 
} from './organization-repository'

// ====================================
// BASE CLASSES & UTILITIES
// ====================================

export { BaseRepository } from './base-repository'
export type { 
  OwnedRepository, 
  SharedRepository, 
  TableName, 
  TableRow, 
  TableInsert, 
  TableUpdate 
} from './base-repository'

// ====================================
// USAGE EXAMPLES
// ====================================

/*
CURRENT PRODUCTION USAGE:

// ✅ In server actions
import { ProjectRepository } from '@/lib/server/repositories'

export async function createProject(formData: FormData) {
  const project = await ProjectRepository.create({
    name: formData.get('name') as string,
    description: formData.get('description') as string
  })
  return { success: true, project }
}

// ✅ In API routes
import { ProjectRepository } from '@/lib/server/repositories'

export async function GET() {
  const projects = await ProjectRepository.findByOwner()
  return NextResponse.json(projects)
}

// ✅ Type-safe operations
import type { CreateProjectData, UpdateProjectData } from '@/lib/server/repositories'

const createData: CreateProjectData = {
  name: 'My App',
  description: 'A cool project'
}

const updateData: UpdateProjectData = {
  name: 'My Updated App'
}
*/

/*
FUTURE MULTI-TENANT USAGE:

When multi-tenant is enabled:
import { OrganizationRepository, ProjectRepository } from '@/lib/server/repositories'

This will work when multi-tenant features are activated:
const orgs = await OrganizationRepository.findAccessible()
const orgProjects = await ProjectRepository.createForOrganization(data, orgId)

SECURITY NOTES:

NEVER import in client components (ESLint will catch this)
import { ProjectRepository } from '@/lib/server/repositories' // ERROR in client

Only use in server contexts:
- API routes (/src/app/api/*.ts)
- Server actions (/src/lib/actions/*.ts) 
- Server components (pages with no 'use client')
- Other server-only modules (/src/lib/server/*.ts)
*/