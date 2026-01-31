#!/usr/bin/env node

/**
 * CI Migration Script
 *
 * Applies SQL migrations from the migrations/ folder to the CI test database.
 * Used by GitHub Actions to bootstrap the test database before running tests.
 *
 * Key behaviors:
 * - Skips Supabase reference schema dumps (not portable to vanilla PostgreSQL)
 * - Uses ON_ERROR_STOP=1 to fail fast on first error (no cascade spam)
 * - Exits with error code if any migration fails
 *
 * Usage: npm run db:migrate:ci
 * Requires: DATABASE_URL environment variable
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '../migrations');

// Check if migrations directory exists
if (!fs.existsSync(migrationsDir)) {
  console.log('No migrations directory found. Skipping migration.');
  process.exit(0);
}

// Get all SQL files sorted by name (assumes numbered prefixes like 001-, 002-)
// Skip Supabase reference schema dumps - they're not portable to vanilla PostgreSQL
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .filter(f => !f.includes('reference_schema'))  // Skip Supabase production dumps
  .sort();

if (files.length === 0) {
  console.log('No migration files found. Skipping migration.');
  process.exit(0);
}

// Check for DATABASE_URL
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL environment variable is not set');
  process.exit(1);
}

console.log(`Found ${files.length} migration files (excluding reference schemas)`);

let applied = 0;
let failed = 0;
let failedFiles = [];

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  console.log(`\n[${applied + failed + 1}/${files.length}] Applying ${file}...`);

  try {
    // Use ON_ERROR_STOP=1 to fail fast on first SQL error
    // This prevents cascading "transaction aborted" errors
    execSync(`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "${filePath}"`, {
      stdio: 'inherit',
      env: process.env
    });
    applied++;
    console.log(`✓ ${file} applied successfully`);
  } catch (error) {
    failed++;
    failedFiles.push(file);
    console.error(`✗ ${file} FAILED: ${error.message}`);

    // Fail fast: stop on first error to get clear diagnostics
    console.error(`\nStopping migration - fix ${file} before continuing.`);
    console.error(`\nMigration summary: ${applied} applied, ${failed} failed`);
    process.exit(1);
  }
}

console.log(`\n========================================`);
console.log(`Migration complete: ${applied} applied, ${failed} failed`);
console.log(`========================================`);

if (failed > 0) {
  console.error('\nFailed migrations:');
  failedFiles.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
}
