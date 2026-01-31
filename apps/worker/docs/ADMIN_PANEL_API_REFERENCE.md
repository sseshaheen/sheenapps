# SheenApps Admin Panel API Reference

This document provides a comprehensive reference for the SheenApps admin panel, covering advisor matching system administration, workspace management, and system monitoring capabilities.

## Table of Contents

- [Authentication](#authentication)
- [Admin Advisor Matching](#admin-advisor-matching)
- [Dashboard & Analytics](#dashboard--analytics)
- [Manual Interventions](#manual-interventions)
- [System Health](#system-health)
- [Error Handling](#error-handling)

## Authentication

All admin endpoints require HMAC authentication with admin role verification. The API automatically validates admin permissions from the signed request context.

### Required Headers
```
x-sheen-signature: [HMAC v1 signature]
x-sheen-sig-v2: [HMAC v2 signature]
x-sheen-timestamp: [Unix timestamp in seconds]
x-sheen-nonce: [Random string for replay protection]
x-sheen-locale: [Optional: en|ar|fr|es|de]
Content-Type: application/json
```

## Admin Advisor Matching

### Manual Assignment Management

#### Create Manual Assignment
```http
POST /api/advisor-matching/admin/assign-advisor
```

**Request:**
```json
{
  "projectId": "proj_123",
  "advisorId": "advisor_456",
  "priority": "high",
  "reason": "Emergency project requirements",
  "skipAvailabilityCheck": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "assignmentId": "assign_789",
    "matchRequestId": "match_abc",
    "status": "assigned",
    "createdAt": "2025-01-15T14:30:00Z"
  }
}
```

#### Get Manual Assignments
```http
GET /api/advisor-matching/admin/assignments/{projectId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "projectId": "proj_123",
    "assignments": [
      {
        "id": "assign_789",
        "advisorId": "advisor_456",
        "advisorName": "Senior Expert",
        "priority": "high",
        "status": "active",
        "reason": "Emergency project requirements",
        "createdAt": "2025-01-15T14:30:00Z",
        "createdBy": "admin_user_123"
      }
    ]
  }
}
```

### Preference Rules Management

#### Create Preference Rule
```http
POST /api/advisor-matching/admin/preference-rules
```

**Request:**
```json
{
  "ruleType": "prefer_advisor",
  "targetAdvisorId": "advisor_456",
  "conditions": {
    "expertise": ["frontend", "react"],
    "projectType": "urgent"
  },
  "priority": 90,
  "isActive": true,
  "expiresAt": "2025-02-15T00:00:00Z"
}
```

#### Get Preference Rules
```http
GET /api/advisor-matching/admin/preference-rules?advisorId=advisor_456&ruleType=prefer_advisor&active=true
```

### Match Override System

#### Override Match Result
```http
POST /api/advisor-matching/admin/override-match
```

**Request:**
```json
{
  "matchRequestId": "match_abc",
  "newAdvisorId": "advisor_789",
  "reason": "Better expertise match identified",
  "priority": "medium"
}
```

### System Monitoring

#### Available Advisors Pool
```http
GET /api/advisor-matching/admin/available-advisors
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalAdvisors": 15,
    "availableNow": 8,
    "advisors": [
      {
        "id": "advisor_123",
        "name": "Expert Advisor",
        "status": "available",
        "expertise": ["frontend", "react", "typescript"],
        "currentProjects": 1,
        "maxProjects": 3,
        "rating": 4.8,
        "lastActive": "2025-01-15T14:00:00Z"
      }
    ]
  }
}
```

#### Match Queue Status
```http
GET /api/advisor-matching/admin/matches?status=pending&limit=50&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": {
    "matches": [
      {
        "id": "match_456",
        "projectId": "proj_123",
        "status": "pending",
        "requestedAt": "2025-01-15T13:00:00Z",
        "expiresAt": "2025-01-15T15:00:00Z",
        "matchCriteria": {
          "expertise": ["backend", "nodejs"],
          "timeline": "urgent"
        },
        "matchedAdvisor": {
          "id": "advisor_789",
          "name": "Backend Specialist"
        }
      }
    ],
    "totalCount": 3,
    "hasMore": false
  }
}
```

## Dashboard & Analytics

### Pool Status Dashboard
```http
GET /api/advisor-matching/admin/dashboard/pool-status?includeDetails=true
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalAdvisors": 15,
      "activeAdvisors": 12,
      "availableNow": 8,
      "utilizationRate": 0.73
    },
    "byExpertise": {
      "frontend": { "total": 8, "available": 3 },
      "backend": { "total": 6, "available": 2 },
      "mobile": { "total": 4, "available": 3 }
    },
    "details": {
      "algorithm": "startup_optimized",
      "avgResponseTime": "2.3 minutes",
      "successRate": 0.94
    }
  }
}
```

### Advisor Workload Analysis
```http
GET /api/advisor-matching/admin/dashboard/advisor-workloads?sortBy=utilization
```

**Response:**
```json
{
  "success": true,
  "data": {
    "workloads": [
      {
        "advisorId": "advisor_123",
        "advisorName": "Top Performer",
        "activeProjects": 3,
        "maxProjects": 3,
        "utilizationRate": 1.0,
        "avgProjectDuration": "14 days",
        "clientSatisfaction": 4.9,
        "expertise": ["frontend", "react"],
        "status": "busy"
      }
    ]
  }
}
```

### Recent Activity Monitor
```http
GET /api/advisor-matching/admin/dashboard/recent-activity?hours=24&limit=100
```

**Response:**
```json
{
  "success": true,
  "data": {
    "activities": [
      {
        "timestamp": "2025-01-15T14:30:00Z",
        "type": "match_created",
        "description": "New match request for Project A",
        "projectId": "proj_123",
        "advisorId": "advisor_456",
        "status": "pending",
        "correlationId": "corr_abc123"
      },
      {
        "timestamp": "2025-01-15T14:25:00Z",
        "type": "advisor_assigned",
        "description": "Advisor manually assigned to Project B",
        "projectId": "proj_456",
        "advisorId": "advisor_789",
        "assignedBy": "admin_user_123"
      }
    ]
  }
}
```

### System Health Monitoring
```http
GET /api/advisor-matching/admin/dashboard/system-health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "matching": {
      "status": "healthy",
      "avgProcessingTime": "1.2s",
      "queueDepth": 2,
      "errorRate": 0.01
    },
    "notifications": {
      "status": "healthy",
      "pendingNotifications": 5,
      "deliveryRate": 0.98
    },
    "database": {
      "status": "healthy",
      "connectionPool": "8/20",
      "avgQueryTime": "15ms"
    }
  }
}
```

### Availability Trends Analysis
```http
GET /api/advisor-matching/admin/dashboard/availability-trends?days=30&advisorId=advisor_123
```

### Matching Performance Metrics
```http
GET /api/advisor-matching/admin/dashboard/matching-metrics?period=week
```

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "week",
    "totalRequests": 47,
    "successRate": 0.94,
    "approvalRate": 0.87,
    "avgResponseTime": "3.2 minutes",
    "topExpertise": [
      { "skill": "frontend", "requests": 18, "successRate": 0.95 },
      { "skill": "backend", "requests": 12, "successRate": 0.92 }
    ],
    "advisorPerformance": [
      {
        "advisorId": "advisor_123",
        "requestCount": 8,
        "acceptanceRate": 0.95,
        "clientSatisfaction": 4.8
      }
    ]
  }
}
```

### Algorithm Configuration
```http
GET /api/advisor-matching/admin/dashboard/configuration
```

**Response:**
```json
{
  "success": true,
  "data": {
    "algorithm": "startup_optimized",
    "thresholds": {
      "complexAlgorithmThreshold": 50,
      "smallPoolThreshold": 10
    },
    "weights": {
      "availability": 0.8,
      "fairness": 0.2,
      "adminPreferences": 1.0
    },
    "performance": {
      "avgProcessingTime": "1.2s",
      "cacheHitRate": 0.85
    }
  }
}
```

## Manual Interventions

### Emergency Assignment
```http
POST /api/advisor-matching/admin/dashboard/emergency-assign
```

**Request:**
```json
{
  "projectId": "proj_urgent",
  "advisorId": "advisor_senior",
  "reason": "Critical client escalation",
  "overrideCapacity": true
}
```

### Notification Processing
```http
POST /api/advisor-matching/admin/process-notifications
```

**Request:**
```json
{
  "batchSize": 50,
  "targetStatus": "pending"
}
```

### Intervention History
```http
GET /api/advisor-matching/admin/interventions?limit=50&days=7
```

**Response:**
```json
{
  "success": true,
  "data": {
    "interventions": [
      {
        "id": "int_123",
        "type": "manual_assignment",
        "projectId": "proj_456",
        "advisorId": "advisor_789",
        "reason": "Client specification change",
        "performedBy": "admin_user_123",
        "createdAt": "2025-01-15T10:30:00Z",
        "outcome": "successful"
      }
    ],
    "summary": {
      "totalInterventions": 12,
      "successRate": 0.92,
      "mostCommonReason": "Capacity override"
    }
  }
}
```

## System Health

### API Health Check
```http
GET /api/advisor-matching/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.0.0",
    "uptime": "5d 12h 30m",
    "timestamp": "2025-01-15T14:45:00Z"
  }
}
```

## Error Handling

### Standard Error Format
All admin endpoints return standardized error responses with correlation IDs for debugging:

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Admin role required for this operation",
    "correlationId": "corr_admin_xyz789",
    "details": {
      "requiredRole": "app_admin",
      "userRole": "authenticated"
    }
  }
}
```

### Common Error Codes
- `INSUFFICIENT_PERMISSIONS` - Admin role required
- `ADVISOR_NOT_FOUND` - Specified advisor does not exist
- `PROJECT_NOT_FOUND` - Specified project does not exist
- `INVALID_ASSIGNMENT` - Assignment conflicts with existing rules
- `CAPACITY_EXCEEDED` - Advisor at maximum project capacity
- `RULE_CONFLICT` - Preference rule conflicts with existing rules

### Rate Limits

Admin endpoints have higher rate limits:
- Dashboard queries: 100 requests/minute
- Administrative actions: 50 requests/minute
- Bulk operations: 10 requests/minute

## 🚀 **Migration Tool Administration** (NEW - December 2025)

### Migration Management

The admin panel provides comprehensive control over the Website Migration Tool system, including user migrations, enterprise operations, system health monitoring, and advanced analytics.

#### List All Migrations
```http
GET /api/admin/migrations
```

**Query Parameters:**
```
?status=<analyzing|processing|completed|failed|cancelled>
&userId=<uuid>
&dateFrom=<iso-date>
&dateTo=<iso-date>
&limit=<number>
&offset=<number>
&orgId=<uuid>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "migrations": [
      {
        "id": "migration_123",
        "userId": "user_456",
        "userEmail": "user@example.com",
        "sourceUrl": "https://example.com",
        "status": "completed",
        "progress": 100,
        "currentPhase": "VERIFY",
        "targetProjectId": "project_789",
        "aiTimeConsumed": 1250,
        "estimatedCost": 31.25,
        "createdAt": "2025-12-07T10:00:00Z",
        "completedAt": "2025-12-07T10:20:00Z",
        "orgId": "org_123",
        "retryCount": 0
      }
    ],
    "total": 2500,
    "limit": 50,
    "offset": 0
  }
}
```

#### Get Migration Details
```http
GET /api/admin/migrations/:id
```

**Response:**
```json
{
  "success": true,
  "data": {
    "migration": {
      "id": "migration_123",
      "userId": "user_456",
      "userDetails": {
        "email": "user@example.com",
        "name": "John Doe",
        "plan": "professional"
      },
      "sourceUrl": "https://example.com",
      "normalizedUrl": "example.com",
      "status": "completed",
      "progress": 100,
      "currentPhase": "VERIFY",
      "targetProjectId": "project_789",
      "userBrief": {
        "goals": "modernize",
        "risk_appetite": "balanced",
        "custom_instructions": "Keep brand colors"
      },
      "metrics": {
        "totalDuration": 1200000,
        "aiTimeConsumed": 1250,
        "phaseDurations": {
          "ANALYZE": 180000,
          "TRANSFORM": 720000,
          "VERIFY": 300000
        },
        "retryCount": 0,
        "verificationAttempts": 1
      },
      "qualityScores": {
        "build": 100,
        "lighthouse": 88,
        "accessibility": 95,
        "seo": 92
      },
      "createdAt": "2025-12-07T10:00:00Z",
      "completedAt": "2025-12-07T10:20:00Z",
      "verifiedAt": "2025-12-07T10:05:00Z"
    }
  }
}
```

#### Force Cancel Migration
```http
POST /api/admin/migrations/:id/cancel
```

**Request:**
```json
{
  "reason": "System maintenance required",
  "notifyUser": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "migrationId": "migration_123",
    "status": "cancelled",
    "reason": "System maintenance required",
    "cancelledAt": "2025-12-07T10:15:00Z",
    "userNotified": true
  }
}
```

#### Retry Migration (Admin Override)
```http
POST /api/admin/migrations/:id/retry
```

**Request:**
```json
{
  "reason": "Admin retry - system error resolved",
  "resetBudget": true,
  "increasedBudget": {
    "softBudgetSeconds": 3600,
    "hardBudgetSeconds": 7200
  },
  "notifyUser": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "migrationId": "migration_123",
    "retryId": "retry_789",
    "status": "analyzing",
    "budgetReset": true,
    "userNotified": true,
    "estimatedDuration": 1200
  }
}
```

### Enterprise Migration Management

#### List Organization Migrations
```http
GET /api/admin/organizations/:orgId/migrations
```

**Response:**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "org_123",
      "name": "Enterprise Corp",
      "plan": "enterprise"
    },
    "migrations": {
      "total": 150,
      "active": 5,
      "completed": 140,
      "failed": 5,
      "recentMigrations": [
        {
          "id": "migration_456",
          "sourceUrl": "https://region1.corp.com",
          "status": "processing",
          "progress": 65,
          "assignedUser": "admin@corp.com",
          "startedAt": "2025-12-07T09:30:00Z"
        }
      ]
    },
    "config": {
      "customBudgets": {
        "softBudgetSeconds": 3600,
        "hardBudgetSeconds": 7200
      },
      "migrationLimits": {
        "concurrentMigrations": 10,
        "dailyMigrations": 50
      }
    }
  }
}
```

#### Manage Organization Config
```http
PUT /api/admin/organizations/:orgId/migration-config
```

**Request:**
```json
{
  "customBudgets": {
    "softBudgetSeconds": 5400,
    "hardBudgetSeconds": 10800,
    "perPhaseCapSeconds": 2700,
    "monthlyAllowanceSeconds": 100000
  },
  "migrationLimits": {
    "concurrentMigrations": 20,
    "dailyMigrations": 100,
    "monthlyMigrations": 1000
  },
  "advancedFeatures": {
    "bulkMigrations": true,
    "whiteGloveService": true,
    "customIntegrations": true,
    "advancedAnalytics": true,
    "prioritySupport": true
  },
  "reason": "Upgraded to enterprise plus plan"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orgId": "org_123",
    "previousConfig": { "..." },
    "newConfig": { "..." },
    "updatedAt": "2025-12-07T10:30:00Z",
    "updatedBy": "admin_user_789"
  }
}
```

### Bulk Migration Operations

#### List Bulk Jobs
```http
GET /api/admin/bulk-migrations
```

**Query Parameters:**
```
?status=<pending|running|completed|failed|cancelled>
&orgId=<uuid>
&limit=<number>
&offset=<number>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bulkJobs": [
      {
        "id": "bulk_456",
        "name": "Q4 Regional Migrations",
        "orgId": "org_123",
        "orgName": "Enterprise Corp",
        "status": "running",
        "totalUrls": 25,
        "completedMigrations": 18,
        "failedMigrations": 2,
        "currentBatch": 3,
        "totalBatches": 5,
        "createdAt": "2025-12-07T08:00:00Z",
        "estimatedCompletionTime": "2025-12-07T12:00:00Z",
        "createdBy": "admin@corp.com"
      }
    ],
    "total": 15,
    "limit": 20,
    "offset": 0
  }
}
```

#### Get Bulk Job Details
```http
GET /api/admin/bulk-migrations/:bulkId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "bulkJob": {
      "id": "bulk_456",
      "name": "Q4 Regional Migrations",
      "description": "Migrate all regional websites for Q4 launch",
      "orgId": "org_123",
      "status": "running",
      "totalUrls": 25,
      "completedMigrations": 18,
      "failedMigrations": 2,
      "currentBatch": 3,
      "totalBatches": 5,
      "scheduling": {
        "batchSize": 5,
        "delayBetweenBatches": 300,
        "scheduledFor": "2025-12-07T08:00:00Z"
      },
      "migrations": [
        {
          "migrationId": "migration_789",
          "url": "https://region1.corp.com",
          "status": "completed",
          "progress": 100,
          "aiTimeConsumed": 1100,
          "completedAt": "2025-12-07T09:15:00Z"
        },
        {
          "migrationId": "migration_790",
          "url": "https://region2.corp.com",
          "status": "failed",
          "progress": 25,
          "errorMessage": "Ownership verification failed",
          "failedAt": "2025-12-07T09:45:00Z"
        }
      ],
      "totalAITimeConsumed": 19500,
      "totalEstimatedCost": 487.50,
      "createdAt": "2025-12-07T08:00:00Z",
      "createdBy": "admin@corp.com"
    }
  }
}
```

#### Force Cancel Bulk Job
```http
POST /api/admin/bulk-migrations/:bulkId/cancel
```

**Request:**
```json
{
  "reason": "System maintenance required",
  "cancelRunningMigrations": true,
  "notifyOrganization": true
}
```

### System Analytics & Monitoring

#### Migration System Overview
```http
GET /api/admin/migration-analytics/overview
```

**Query Parameters:**
```
?timeRange=<1d|7d|30d|90d>
&includeOrganizations=<boolean>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": {
      "totalMigrations": 12500,
      "activeMigrations": 45,
      "successRate": 94.2,
      "averageCompletionTime": 720000,
      "totalAITimeConsumed": 2850000,
      "totalCostGenerated": 71250.00
    },
    "trends": {
      "migrationsPerDay": [
        { "date": "2025-12-01", "count": 125, "successRate": 95.2 },
        { "date": "2025-12-02", "count": 134, "successRate": 93.8 },
        { "date": "2025-12-03", "count": 142, "successRate": 96.1 }
      ],
      "aiTimeConsumption": [
        { "date": "2025-12-01", "seconds": 15000, "cost": 375.00 },
        { "date": "2025-12-02", "seconds": 16800, "cost": 420.00 }
      ]
    },
    "topFailureReasons": [
      { "reason": "ownership_verification_failed", "count": 145, "percentage": 35.2 },
      { "reason": "build_validation_failed", "count": 89, "percentage": 21.6 },
      { "reason": "ai_budget_exceeded", "count": 67, "percentage": 16.3 }
    ],
    "organizationStats": [
      {
        "orgId": "org_123",
        "orgName": "Enterprise Corp",
        "totalMigrations": 150,
        "successRate": 96.7,
        "aiTimeConsumed": 125000,
        "cost": 3125.00
      }
    ]
  }
}
```

#### Migration Performance Metrics
```http
GET /api/admin/migration-analytics/performance
```

**Response:**
```json
{
  "success": true,
  "data": {
    "performance": {
      "averageDurationByPhase": {
        "ANALYZE": 185000,
        "PLAN": 125000,
        "TRANSFORM": 750000,
        "VERIFY": 315000,
        "DEPLOY": 180000
      },
      "qualityGatesPassRate": {
        "build": 98.5,
        "lighthouse": 87.2,
        "accessibility": 92.8,
        "seo": 94.1
      },
      "systemHealth": {
        "crawlerHealthScore": 96,
        "aiServiceAvailability": 99.2,
        "storageCapacity": 75.5,
        "averageResponseTime": 245
      }
    },
    "bottlenecks": [
      {
        "phase": "TRANSFORM",
        "issue": "Large asset optimization",
        "impact": "increases duration by ~30%",
        "recommendation": "Implement parallel processing"
      }
    ],
    "recommendations": [
      "Consider increasing AI budget defaults for large sites",
      "Optimize crawler timeouts for better reliability",
      "Add pre-flight checks for common failure patterns"
    ]
  }
}
```

### User Migration Management

#### List User Migrations
```http
GET /api/admin/users/:userId/migrations
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_456",
      "email": "user@example.com",
      "name": "John Doe",
      "plan": "professional",
      "aiTimeBalance": {
        "total": 2500,
        "welcomeBonus": 0,
        "dailyGift": 900,
        "paid": 1600
      }
    },
    "migrations": [
      {
        "id": "migration_123",
        "sourceUrl": "https://example.com",
        "status": "completed",
        "progress": 100,
        "aiTimeConsumed": 1250,
        "createdAt": "2025-12-07T10:00:00Z",
        "completedAt": "2025-12-07T10:20:00Z"
      }
    ],
    "stats": {
      "totalMigrations": 5,
      "successfulMigrations": 4,
      "failedMigrations": 1,
      "totalAITimeUsed": 4200,
      "averageCompletionTime": 900000,
      "lastMigrationAt": "2025-12-07T10:00:00Z"
    }
  }
}
```

#### Grant AI Time for Migration
```http
POST /api/admin/users/:userId/grant-ai-time
```

**Request:**
```json
{
  "seconds": 3600,
  "reason": "Migration support - complex site migration",
  "notifyUser": true,
  "expiresAt": "2025-12-14T10:00:00Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "user_456",
    "grantedSeconds": 3600,
    "previousBalance": 500,
    "newBalance": 4100,
    "reason": "Migration support - complex site migration",
    "grantedBy": "admin_user_789",
    "grantedAt": "2025-12-07T10:30:00Z",
    "expiresAt": "2025-12-14T10:00:00Z",
    "userNotified": true
  }
}
```

### System Configuration

#### Get Migration System Config
```http
GET /api/admin/migration-system/config
```

**Response:**
```json
{
  "success": true,
  "data": {
    "config": {
      "defaultBudgets": {
        "smallSite": 300,
        "mediumSite": 900,
        "largeSite": 1800,
        "enterpriseSite": 3600
      },
      "rateLimits": {
        "migrationsPerHour": 3,
        "statusChecksPerMinute": 60,
        "enterpriseBulkPerHour": 1
      },
      "qualityThresholds": {
        "buildSuccessRate": 95,
        "redirectAccuracy": 95,
        "lighthousePerformance": 80,
        "wcagCompliance": 90,
        "legacyBlockRatio": 25
      },
      "systemLimits": {
        "maxConcurrentMigrations": 100,
        "maxPagesPerSite": 500,
        "crawlTimeoutSeconds": 30,
        "migrationTimeoutMinutes": 60
      }
    }
  }
}
```

#### Update System Configuration
```http
PUT /api/admin/migration-system/config
```

**Request:**
```json
{
  "defaultBudgets": {
    "smallSite": 360,
    "mediumSite": 1080,
    "largeSite": 2160,
    "enterpriseSite": 4320
  },
  "rateLimits": {
    "migrationsPerHour": 5,
    "statusChecksPerMinute": 100
  },
  "reason": "Increased budgets for better success rates"
}
```

### Migration Tool Health

#### System Health Check
```http
GET /api/admin/migration-system/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "services": {
      "migrationOrchestrator": {
        "status": "healthy",
        "responseTime": 125,
        "activeJobs": 15
      },
      "aiToolboxService": {
        "status": "healthy",
        "responseTime": 89,
        "toolsAvailable": 14
      },
      "websiteAnalysisService": {
        "status": "healthy",
        "responseTime": 234,
        "crawlerInstances": 8
      },
      "qualityGatesService": {
        "status": "healthy",
        "responseTime": 156,
        "lighthouseInstances": 3
      }
    },
    "metrics": {
      "queueDepth": 23,
      "averageProcessingTime": 720000,
      "successRate": 94.2,
      "errorRate": 2.1
    },
    "alerts": [
      {
        "level": "warning",
        "message": "Lighthouse service response time elevated",
        "metric": 245,
        "threshold": 200,
        "since": "2025-12-07T09:45:00Z"
      }
    ]
  }
}
```

### Error Investigation

#### Get Migration Error Details
```http
GET /api/admin/migrations/:id/errors
```

**Response:**
```json
{
  "success": true,
  "data": {
    "migration": {
      "id": "migration_123",
      "sourceUrl": "https://example.com",
      "status": "failed"
    },
    "errors": [
      {
        "phase": "VERIFY",
        "agent": "critic",
        "errorType": "quality_gate_failure",
        "message": "Build validation failed - TypeScript compilation errors",
        "details": {
          "buildErrors": [
            "Property 'className' does not exist on type 'Props'",
            "Cannot find module './missing-component'"
          ]
        },
        "timestamp": "2025-12-07T10:15:30Z",
        "recoverable": true,
        "suggestedAction": "retry_with_fixes"
      }
    ],
    "toolCalls": [
      {
        "id": "tool_456",
        "tool": "verifier.run@1.0.0",
        "status": "failed",
        "result": {
          "buildPassed": false,
          "errors": ["TypeScript compilation failed"]
        },
        "timestamp": "2025-12-07T10:15:25Z"
      }
    ],
    "systemLogs": [
      {
        "level": "error",
        "message": "Quality gate failure in build validation",
        "context": {
          "migrationId": "migration_123",
          "phase": "VERIFY"
        },
        "timestamp": "2025-12-07T10:15:30Z"
      }
    ]
  }
}
```

### Advanced Actions

#### Whitelist Domain for Migration
```http
POST /api/admin/migration-system/whitelist-domain
```

**Request:**
```json
{
  "domain": "special-customer.com",
  "reason": "Enterprise customer with complex requirements",
  "increasedLimits": {
    "maxPages": 1000,
    "budgetMultiplier": 2.0,
    "timeoutMinutes": 120
  },
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "domain": "special-customer.com",
    "whitelistedAt": "2025-12-07T10:30:00Z",
    "whitelistedBy": "admin_user_789",
    "specialLimits": {
      "maxPages": 1000,
      "budgetMultiplier": 2.0,
      "timeoutMinutes": 120
    },
    "expiresAt": "2025-12-31T23:59:59Z"
  }
}
```

#### Emergency Migration Shutdown
```http
POST /api/admin/migration-system/emergency-shutdown
```

**Request:**
```json
{
  "reason": "Critical system issue - immediate shutdown required",
  "cancelActiveMigrations": true,
  "notifyUsers": true,
  "estimatedDowntime": "30 minutes"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "shutdownInitiated": "2025-12-07T10:30:00Z",
    "reason": "Critical system issue - immediate shutdown required",
    "activeMigrationsCancelled": 45,
    "usersNotified": 234,
    "estimatedDowntime": "30 minutes",
    "shutdownBy": "admin_user_789"
  }
}
```

---

**Admin Panel Ready!** 🛠️

This API reference covers all administrative capabilities for the intelligent advisor matching system and the comprehensive Website Migration Tool administration, providing complete control and visibility for system administrators.