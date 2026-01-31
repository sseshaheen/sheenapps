#!/usr/bin/env ts-node
/**
 * Route Coverage Audit
 *
 * Compares Next.js proxy routes (callWorker paths) against worker route registrations.
 * Fails if any proxy calls a worker route that doesn't exist.
 *
 * Usage: npx ts-node scripts/audit-route-coverage.ts
 *
 * Prevents Bug #3 class issues (missing worker endpoints) from reaching production.
 */

import * as fs from 'fs'
import * as path from 'path'

const NEXTJS_API_DIR = path.resolve(__dirname, '../../sheenappsai/src/app/api/inhouse')
const WORKER_ROUTES_DIR = path.resolve(__dirname, '../src/routes')

// Extract callWorker paths from Next.js proxy files
function extractProxyPaths(dir: string): { file: string; path: string; method: string }[] {
  const results: { file: string; path: string; method: string }[] = []

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return

    const entries = fs.readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.name === 'route.ts') {
        const content = fs.readFileSync(fullPath, 'utf8')

        // Match callWorker({ method: '...', path: '...' })
        const callWorkerRegex = /callWorker\(\s*\{[^}]*method:\s*['"](\w+)['"][^}]*path:\s*[`'"](\/v1\/[^`'"]+)[`'"][^}]*\}/gs
        let match: RegExpExecArray | null
        while ((match = callWorkerRegex.exec(content)) !== null) {
          results.push({
            file: path.relative(path.resolve(__dirname, '../..'), fullPath),
            method: match[1]!,
            path: match[2]!
              // Normalize template literals: ${projectId} → :param
              .replace(/\$\{[^}]+\}/g, ':param'),
          })
        }

        // Also try reversed order (path before method)
        const callWorkerRegex2 = /callWorker\(\s*\{[^}]*path:\s*[`'"](\/v1\/[^`'"]+)[`'"][^}]*method:\s*['"](\w+)['"][^}]*\}/gs
        while ((match = callWorkerRegex2.exec(content)) !== null) {
          results.push({
            file: path.relative(path.resolve(__dirname, '../..'), fullPath),
            method: match[2]!,
            path: match[1]!.replace(/\$\{[^}]+\}/g, ':param'),
          })
        }
      }
    }
  }

  walk(dir)
  return results
}

// Extract registered routes from worker route files
function extractWorkerRoutes(dir: string): { file: string; path: string; method: string }[] {
  const results: { file: string; path: string; method: string }[] = []

  if (!fs.existsSync(dir)) return results

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'))
  for (const file of files) {
    const fullPath = path.join(dir, file)
    const content = fs.readFileSync(fullPath, 'utf8')

    // Match fastify.get/post/put/delete/patch('path', ...)
    const routeRegex = /fastify\.(get|post|put|delete|patch)\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g
    let match: RegExpExecArray | null
    while ((match = routeRegex.exec(content)) !== null) {
      results.push({
        file: path.relative(path.resolve(__dirname, '..'), fullPath),
        method: match[1]!.toUpperCase(),
        path: match[2]!,
      })
    }

    // Also match app.get/post/put/delete/patch (some routes use `app` instead of `fastify`)
    const appRouteRegex = /app\.(get|post|put|delete|patch)\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g
    while ((match = appRouteRegex.exec(content)) !== null) {
      results.push({
        file: path.relative(path.resolve(__dirname, '..'), fullPath),
        method: match[1]!.toUpperCase(),
        path: match[2]!,
      })
    }
  }

  return results
}

// Normalize a path for comparison: replace :param with a wildcard
function normalizePath(p: string): string {
  return p.replace(/:[a-zA-Z_]+/g, ':*')
}

function main() {
  console.log('🔍 Route Coverage Audit\n')

  const proxyRoutes = extractProxyPaths(NEXTJS_API_DIR)
  const workerRoutes = extractWorkerRoutes(WORKER_ROUTES_DIR)

  console.log(`Found ${proxyRoutes.length} proxy routes in Next.js`)
  console.log(`Found ${workerRoutes.length} registered routes in worker\n`)

  // Build a set of normalized worker routes
  const workerRouteSet = new Set(
    workerRoutes.map(r => `${r.method}:${normalizePath(r.path)}`)
  )

  // Check each proxy route
  const missing: typeof proxyRoutes = []
  const matched: typeof proxyRoutes = []

  for (const proxy of proxyRoutes) {
    const normalized = `${proxy.method}:${normalizePath(proxy.path)}`
    if (workerRouteSet.has(normalized)) {
      matched.push(proxy)
    } else {
      missing.push(proxy)
    }
  }

  // Report
  if (matched.length > 0) {
    console.log(`✅ ${matched.length} proxy routes have matching worker endpoints`)
  }

  if (missing.length > 0) {
    console.log(`\n❌ ${missing.length} proxy route(s) call worker endpoints that don't exist:\n`)
    for (const route of missing) {
      console.log(`  ${route.method} ${route.path}`)
      console.log(`    → Proxy: ${route.file}\n`)
    }
    process.exit(1)
  } else {
    console.log('\n✅ All proxy routes have matching worker endpoints')
  }
}

main()
