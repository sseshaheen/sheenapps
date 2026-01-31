import { pool } from '../../services/database'

type AuditMeta = Record<string, any> | null

export function auditAdminAction(args: {
  adminId: string
  action: string
  projectId?: string | null
  resourceType?: string | null
  resourceId?: string | null
  reason?: string | null
  metadata?: AuditMeta
  ipAddress?: string | null
  userAgent?: string | null
}) {
  if (!pool) return

  void pool
    .query(
      `SELECT log_inhouse_admin_action($1, $2, $3, $4, $5, $6, $7, $8::inet, $9)`,
      [
        args.adminId,
        args.action,
        args.projectId ?? null,
        args.resourceType ?? null,
        args.resourceId ?? null,
        args.reason ?? null,
        args.metadata ? JSON.stringify(args.metadata) : null,
        args.ipAddress ?? null,
        args.userAgent ?? null,
      ]
    )
    .catch((error) => {
      console.error('Failed to log admin action:', error)
    })
}
