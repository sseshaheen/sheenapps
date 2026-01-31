# Phantom Build Investigation Queries

Run these queries to help identify where buildId 'KDJ7PPEK' is coming from:

## Query 1: Discover all columns in projects table

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'projects'
ORDER BY ordinal_position;
```

**Purpose**: See actual column names (not assumed `currentBuildId`, etc.)

---

## Query 2: Get the actual project data

```sql
SELECT *
FROM projects
WHERE id = 'a7e7f6d8-16eb-4187-bdc9-e75d6497de06';
```

**Purpose**: See all fields, identify any column that might contain 'KDJ7PPEK'

---

## Query 3: Find all tables with 'build' in the name

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%build%'
ORDER BY table_name;
```

**Purpose**: Discover actual table names (not assumed `project_builds`, etc.)

---

## Query 4: Find all columns named 'build_id' across all tables

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'build_id'
ORDER BY table_name;
```

**Purpose**: Find every table that references builds

---

## Query 5: Search for 'KDJ7PPEK' across all text/varchar columns

This is a broad search - might be slow but will find the buildId anywhere:

```sql
-- For each table with text/varchar columns, search for 'KDJ7PPEK'
-- You may need to run these individually:

SELECT 'projects' as table_name, id, * FROM projects WHERE CAST(projects AS text) LIKE '%KDJ7PPEK%';
SELECT 'project_chat_log_minimal' as table_name, id, * FROM project_chat_log_minimal WHERE CAST(project_chat_log_minimal AS text) LIKE '%KDJ7PPEK%';
```

**Alternative approach** (if above doesn't work): Check specific likely columns:

```sql
-- Search in projects table for any column containing the buildId
SELECT *
FROM projects
WHERE id = 'a7e7f6d8-16eb-4187-bdc9-e75d6497de06'
  AND (
    -- Add OR clauses for each text column you see in Query 1 results
    -- Example pattern:
    -- some_column::text LIKE '%KDJ7PPEK%' OR
    -- another_column::text LIKE '%KDJ7PPEK%' OR
  );
```

---

## Query 6: Find tables with 'event' in the name

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%event%'
ORDER BY table_name;
```

**Purpose**: Maybe events are stored differently than assumed

---

## Query 7: Check for JSONB columns that might store build data

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type IN ('jsonb', 'json')
  AND table_name IN ('projects', 'project_chat_log_minimal')
ORDER BY table_name, column_name;
```

**Purpose**: Build info might be nested in JSON columns

---

## Query 8: If you found JSONB columns, search inside them

Example (adjust column names based on Query 7):

```sql
-- Search inside response_data JSONB column
SELECT id, response_data
FROM project_chat_log_minimal
WHERE project_id = 'a7e7f6d8-16eb-4187-bdc9-e75d6497de06'
  AND response_data::text LIKE '%KDJ7PPEK%';

-- Search inside any JSONB column in projects
SELECT id, template_data, business_idea -- adjust column names
FROM projects
WHERE id = 'a7e7f6d8-16eb-4187-bdc9-e75d6497de06';
```

---

## Query 9: Check for version/deployment tables

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND (table_name LIKE '%version%' OR table_name LIKE '%deploy%')
ORDER BY table_name;
```

**Purpose**: Builds might be tracked in deployment/version tables

---

## Query 10: Full text search using pg_trgm (if available)

```sql
-- Check if pg_trgm extension is available
SELECT * FROM pg_extension WHERE extname = 'pg_trgm';

-- If available, you can do broader searches like:
-- (This is advanced - skip if not familiar)
```

---

## What to Share Back

After running these queries, please share:

1. **From Query 1**: The actual column names in `projects` table (especially any with 'build', 'version', 'current', 'status' in name)
2. **From Query 2**: The full project record (you can redact sensitive data, but keep build-related fields)
3. **From Query 3**: List of all tables with 'build' in the name
4. **From Query 4**: All tables that have a `build_id` column
5. **From Query 5**: Any rows where 'KDJ7PPEK' appears
6. **From Query 8**: Any JSONB data containing build info

This will help us understand the actual schema and locate the phantom build data source!
