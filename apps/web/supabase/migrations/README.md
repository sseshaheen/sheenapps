# Database Migrations

This folder contains all database migrations for the Claude Worker project.

## Migration Files

- **001-xxx.sql** - Regular migrations that should be run in order
- **000_reference_schema_YYYYMMDD.sql** - Reference schema exports (DO NOT RUN AS MIGRATIONS)

## Reference Schema

The `000_reference_schema_*.sql` files are complete database schema exports that serve as references. They include:

- All schemas
- Extensions
- Custom types
- Tables with all columns
- Constraints (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)
- Indexes
- Views
- Functions and procedures
- Triggers
- Sequences

**IMPORTANT**: These reference files should NOT be run as migrations. They are for documentation and reference purposes only.

## Creating New Migrations

When creating new migrations:
1. Use the next available number (e.g., if the last migration is 016, use 017)
2. Give it a descriptive name
3. Include comments explaining the purpose
4. Test the migration locally before deploying

## Running Migrations

Migrations are typically run automatically by your deployment pipeline or database management tool.

To run migrations manually:
```bash
psql $DATABASE_URL -f migrations/xxx_migration_name.sql
```