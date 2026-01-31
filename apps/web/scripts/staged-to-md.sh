#!/bin/bash
# staged-to-md.sh - Export staged git files to a markdown document for code review
#
# Usage: ./scripts/staged-to-md.sh [options]
#
# Options:
#   -o, --output FILE     Output file path (default: docs/staged-review-TIMESTAMP.md)
#   -e, --exclude PATTERN Exclude files matching glob pattern (can be used multiple times)
#   -t, --title TITLE     Document title (default: "Staged Files Review")
#   -h, --help            Show help
#
# Examples:
#   ./scripts/staged-to-md.sh                              # Export all staged files
#   ./scripts/staged-to-md.sh -e "*.sql"                   # Exclude SQL files
#   ./scripts/staged-to-md.sh -e "*.sql" -e "*.lock"       # Exclude multiple patterns
#   ./scripts/staged-to-md.sh -o review.md -t "Sprint 3"   # Custom output and title

set -e

# Navigate to repo root
cd "$(git rev-parse --show-toplevel)"

# Defaults
OUTPUT=""
TITLE="Staged Files Review"
EXCLUDE_PATTERNS=()

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -o|--output)
      OUTPUT="$2"
      shift 2
      ;;
    -e|--exclude)
      EXCLUDE_PATTERNS+=("$2")
      shift 2
      ;;
    -t|--title)
      TITLE="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,/^[^#]/p' "$0" | grep "^#" | sed 's/^# //' | sed 's/^#$//'
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      echo "Use -h for help"
      exit 1
      ;;
  esac
done

# Default output file if not specified
if [[ -z "$OUTPUT" ]]; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  OUTPUT="docs/staged-review-${TIMESTAMP}.md"
fi

# Get staged files (Added, Copied, Modified, Renamed - not Deleted)
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACMR)

if [[ -z "$STAGED_FILES" ]]; then
  echo "No staged files found."
  exit 0
fi

# Check if file matches any exclusion pattern
should_exclude() {
  local file="$1"
  for pattern in "${EXCLUDE_PATTERNS[@]}"; do
    case "$file" in
      $pattern) return 0 ;;
    esac
  done
  return 1
}

# Filter files
FILTERED_FILES=()
while IFS= read -r file; do
  if ! should_exclude "$file"; then
    FILTERED_FILES+=("$file")
  fi
done <<< "$STAGED_FILES"

if [[ ${#FILTERED_FILES[@]} -eq 0 ]]; then
  echo "No files remaining after exclusions."
  exit 0
fi

# Create output directory if needed
mkdir -p "$(dirname "$OUTPUT")"

# Get language for code fence based on extension
get_lang() {
  case "$1" in
    *.tsx) echo "tsx" ;;
    *.ts) echo "ts" ;;
    *.jsx) echo "jsx" ;;
    *.js) echo "js" ;;
    *.mjs) echo "js" ;;
    *.cjs) echo "js" ;;
    *.sql) echo "sql" ;;
    *.json) echo "json" ;;
    *.md) echo "md" ;;
    *.mdx) echo "mdx" ;;
    *.css) echo "css" ;;
    *.scss) echo "scss" ;;
    *.less) echo "less" ;;
    *.html) echo "html" ;;
    *.py) echo "python" ;;
    *.sh) echo "bash" ;;
    *.bash) echo "bash" ;;
    *.zsh) echo "zsh" ;;
    *.yaml|*.yml) echo "yaml" ;;
    *.toml) echo "toml" ;;
    *.xml) echo "xml" ;;
    *.svg) echo "svg" ;;
    *.go) echo "go" ;;
    *.rs) echo "rust" ;;
    *.rb) echo "ruby" ;;
    *.php) echo "php" ;;
    *.java) echo "java" ;;
    *.swift) echo "swift" ;;
    *.kt) echo "kotlin" ;;
    *.c|*.h) echo "c" ;;
    *.cpp|*.hpp|*.cc) echo "cpp" ;;
    *.cs) echo "csharp" ;;
    *.vue) echo "vue" ;;
    *.svelte) echo "svelte" ;;
    *.prisma) echo "prisma" ;;
    *.graphql|*.gql) echo "graphql" ;;
    *.dockerfile|Dockerfile*) echo "dockerfile" ;;
    *.env*) echo "bash" ;;
    *) echo "" ;;
  esac
}

# Check if file is binary
is_binary() {
  local file="$1"
  # Use git's own detection for staged files
  local mime
  mime=$(git show ":$file" 2>/dev/null | file --mime-type --brief - 2>/dev/null || echo "unknown")
  case "$mime" in
    text/*|application/json|application/javascript|application/xml) return 1 ;;
    unknown) return 1 ;; # Assume text if can't detect
    *) return 0 ;;
  esac
}

# Generate anchor for TOC links
make_anchor() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//'
}

# Write the markdown file
{
  echo "# $TITLE"
  echo ""
  echo "Generated: $(date '+%Y-%m-%d %H:%M:%S')"
  echo ""
  echo "**Files included:** ${#FILTERED_FILES[@]}"
  if [[ ${#EXCLUDE_PATTERNS[@]} -gt 0 ]]; then
    echo ""
    echo "**Exclusions:** ${EXCLUDE_PATTERNS[*]}"
  fi
  echo ""

  # Table of Contents
  echo "## Table of Contents"
  echo ""
  for file in "${FILTERED_FILES[@]}"; do
    anchor=$(make_anchor "$file")
    echo "- [$file](#$anchor)"
  done
  echo ""
  echo "---"
  echo ""

  # File contents
  for file in "${FILTERED_FILES[@]}"; do
    echo "## $file"
    echo ""

    if is_binary "$file"; then
      echo "*Binary file - contents not shown*"
    else
      lang=$(get_lang "$file")
      echo "\`\`\`$lang"
      git show ":$file" 2>/dev/null
      echo "\`\`\`"
    fi

    echo ""
    echo ""
    echo "---"
    echo ""
  done
} > "$OUTPUT"

echo "Created: $OUTPUT"
echo "Files:   ${#FILTERED_FILES[@]}"
