import { notFound } from 'next/navigation'
import { DashboardContent } from '@/components/dashboard/dashboard-content'
import { MinimalDashboardContent } from '@/components/dashboard/dashboard-content-minimal'
import { getNamespacedMessages } from '@/i18n/request'

export const dynamic = 'force-dynamic'

interface DashboardPageProps {
  params: Promise<{
    locale: string
  }>
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { locale } = await params
  
  // Load only the namespaces this page needs
  const messages = await getNamespacedMessages(locale, [
    'dashboard',
    'projects',
    'common',
    'toasts',
    'referral',
    'builder'
  ])

  const translations = {
    dashboard: {
      title: messages.dashboard?.title || 'Dashboard',
      subtitle: messages.dashboard?.subtitle || 'Manage your projects',
      searchPlaceholder: messages.dashboard?.searchPlaceholder || 'Search projects...',
      createProject: messages.dashboard?.createProject || 'Create New Project',
      createShort: messages.dashboard?.createShort || 'Create',
      noProjects: messages.dashboard?.noProjects || 'No projects found',
      noProjectsDescription: messages.dashboard?.noProjectsDescription || 'Create your first project to get started',
      noArchivedProjects: messages.dashboard?.noArchivedProjects || 'No archived projects',
      noActiveProjects: messages.dashboard?.noActiveProjects || 'No active projects',
      clearFilters: messages.dashboard?.clearFilters || 'Clear filters',
      sortBy: messages.dashboard?.sortBy || 'Sort by',
      filterBy: messages.dashboard?.filterBy || 'Filter by',
      lastUpdated: messages.dashboard?.lastUpdated || 'Last updated',
      created: messages.dashboard?.created || 'Created',
      name: messages.dashboard?.name || 'Name',
      archived: messages.dashboard?.archived || 'Archived',
      active: messages.dashboard?.active || 'Active',
      allProjects: messages.dashboard?.allProjects || 'All projects',
      projectsLabel: messages.dashboard?.projectsLabel || 'projects',
      loading: messages.dashboard?.loading || 'Loading...',
    },
    projects: {
      rename: messages.projects?.rename || 'Rename',
      duplicate: messages.projects?.duplicate || 'Duplicate',
      archive: messages.projects?.archive || 'Archive',
      delete: messages.projects?.delete || 'Delete',
      restore: messages.projects?.restore || 'Restore',
      publish: messages.projects?.publish || 'Publish',
      unpublish: messages.projects?.unpublish || 'Unpublish',
      openBuilder: messages.projects?.openBuilder || 'Open Builder',
      confirmDelete: messages.projects?.confirmDelete || 'Are you sure you want to delete this project?',
      deleteWarning: messages.projects?.deleteWarning || 'This action cannot be undone.',
      projectDeleted: messages.projects?.projectDeleted || 'Project deleted successfully',
      projectRenamed: messages.projects?.projectRenamed || 'Project renamed successfully',
      projectDuplicated: messages.projects?.projectDuplicated || 'Project duplicated successfully',
      projectArchived: messages.projects?.projectArchived || 'Project archived successfully',
      projectRestored: messages.projects?.projectRestored || 'Project restored successfully',
    },
    common: {
      cancel: messages.common?.cancel || 'Cancel',
      confirm: messages.common?.confirm || 'Confirm',
      save: messages.common?.save || 'Save',
      loading: messages.common?.loading || 'Loading...',
      error: messages.common?.error || 'An error occurred',
      success: messages.common?.success || 'Success',
    },
    toasts: messages.toasts || {},
    builder: {
      templates: messages.builder?.templates || {}
    }
  }

  // ✅ FIXED: Infinite loop resolved - back to full dashboard
  return <DashboardContent translations={translations} locale={locale} />
}