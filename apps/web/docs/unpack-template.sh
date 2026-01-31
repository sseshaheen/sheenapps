#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# unpack-template.sh
#
# Usage:  ./unpack-template.sh [--force] [path/to/output.json]
#
#   --force | -f   Delete any existing target folder before unpacking.
#   output.json    Path to the generator’s JSON (defaults to ./output.json)
#
# Requires: jq, coreutils, npm  (pnpm optional but recommended)
# ---------------------------------------------------------------------------
set -euo pipefail

# ─── CLI args ----------------------------------------------------------------
FORCE=false
OUTPUT="output.json"

for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
    *)          OUTPUT="$arg" ;;
  esac
done

[[ -f "$OUTPUT" ]] || { echo "❌ JSON file '$OUTPUT' not found."; exit 1; }

# ─── Determine base dir name -------------------------------------------------
BASE_DIR="$(jq -r '.name' "$OUTPUT")"
[[ "$BASE_DIR" != "null" && -n "$BASE_DIR" ]] || {
  echo "❌ JSON has no .name field."; exit 1;
}

echo "🗂️  Target folder: $BASE_DIR"

if [[ -d "$BASE_DIR" ]]; then
  if $FORCE; then
    echo "⚠️  --force supplied → removing existing '$BASE_DIR'"
    rm -rf "$BASE_DIR"
  else
    echo "❌ Directory '$BASE_DIR' already exists. Use --force to overwrite." >&2
    exit 1
  fi
fi

mkdir -p "$BASE_DIR"

# # ─── Helper to write files ---------------------------------------------------
# write_file() {
#   local rel="$1" content="$2"
#   local full="$BASE_DIR/$rel"
#   mkdir -p "$(dirname "$full")"
#   printf '%s' "$content" > "$full"
# }

# updated so that any  file containing \n escapes will be written with actual newlines, and Vite will be able to parse it.
write_file() {
  local rel="$1" content="$2"
  local full="$BASE_DIR/$rel"
  mkdir -p "$(dirname "$full")"
  # 1) interpret \n → newlines (and other printf escapes)
  # 2) then remove any \" → "
  printf '%b' "$content" \
    | sed 's/\\"/"/g' \
    > "$full"
}

# ─── Unpack templateFiles[] (handle both strings and objects) ---------------
jq -c '.templateFiles[]' "$OUTPUT" | while read -r entry; do
  # Determine path
  path=$(echo "$entry" | jq -r '
    if type=="string" then
      .
    elif (.path?     // false) then
      .path
    elif (.file?     // false) then
      .file
    elif (.filename? // false) then
      .filename
    elif (.name?     // false) then
      .name
    else
      error("➤ templateFiles entry missing path/file/filename/name")
    end
  ')

  # Determine content:
  #  • for objects, use .content
  #  • for strings, find matching file in .files[]
  if echo "$entry" | jq -e 'type=="object"' >/dev/null; then
    content=$(echo "$entry" | jq -r '.content')
  else
    # lookup in .files[] array by path
    content=$(jq -r --arg p "$path" '
      .files[]
      | select(.path == $p or .file == $p or .filename == $p)
      | .content
    ' "$OUTPUT")
  fi

  write_file "$path" "$content"
done

# ─── Unpack files[] (skip strings, skip no-content) --------------------------
jq -c '.files[]' "$OUTPUT" | while read -r entry; do
  # 1) skip plain strings
  if echo "$entry" | jq -e 'type!="object"' >/dev/null; then
    path=$(echo "$entry" | jq -r '.')
    echo "⚠️  Skipping files[] entry '$path' (string, no content)"
    continue
  fi

  # 2) skip objects without .content
  if ! echo "$entry" | jq -e 'has("content")' >/dev/null; then
    path=$(echo "$entry" | jq -r '
      if     (.path?     // null) then .path
      elif   (.file?     // null) then .file
      else   .filename // "(unknown)"
      end
    ')
    echo "⚠️  Skipping files[] entry '$path' (no content field)"
    continue
  fi

  # 3) valid file → unpack
  path=$(echo "$entry" | jq -r '
    if     (.path?     // null) then .path
    elif   (.file?     // null) then .file
    else   .filename
    end
  ')
  content=$(echo "$entry" | jq -r '.content')
  write_file "$path" "$content"
done

echo "✅ Files unpacked."

# ─── Validate & bump dependency versions ------------------------------------
PACKAGE_JSON="$BASE_DIR/package.json"
TMP_JSON="$BASE_DIR/package.fixed.json"

if [[ -f "$PACKAGE_JSON" ]]; then
  echo "🔍 Validating dependency versions …"
  cp "$PACKAGE_JSON" "$TMP_JSON"

  for section in dependencies devDependencies; do
    jq -r --arg sec "$section" '.[$sec] // {} | to_entries[] | "\(.key) \(.value)"' \
      "$PACKAGE_JSON" \
    | while read -r pkg declared; do
        latest=$(npm view "$pkg" version 2>/dev/null || echo "not-found")

        if [[ "$latest" == "not-found" ]]; then
          echo "   • 🗑️  Removing '$pkg' from $section (not on npm)"
          # delete the package entry
          jq --arg p "$pkg" --arg sec "$section" 'del(.[$sec][$p])' \
            "$TMP_JSON" > "${TMP_JSON}.tmp" && mv "${TMP_JSON}.tmp" "$TMP_JSON"
          continue
        fi


        if [[ "$declared" != *"$latest"* ]]; then
          echo "   • 🛠  $pkg: $declared → ^$latest"
          jq --arg p "$pkg" --arg v "^$latest" --arg sec "$section" \
            '(.[$sec][$p]) = $v' "$TMP_JSON" \
            > "${TMP_JSON}.tmp" \
            && mv "${TMP_JSON}.tmp" "$TMP_JSON"
        fi
      done
  done

  mv "$TMP_JSON" "$PACKAGE_JSON"
  echo "✅ package.json updated."
else
  echo "⚠️  No package.json found; skipping version check."
fi

# ─── Install deps ------------------------------------------------------------
cd "$BASE_DIR"

if command -v pnpm >/dev/null 2>&1; then
  echo "📦 Installing with pnpm …"
  pnpm install
  START_CMD="pnpm dev"
else
  echo "📦 'pnpm' not found – falling back to npm."
  npm install
  START_CMD="npm run dev"
fi

# ─── Launch dev server -------------------------------------------------------
echo "🚀 Starting dev server ($START_CMD)"
$START_CMD &
DEV_PID=$!

echo -e "\n-------------------------------------------"
echo "🖥  Dev server running (PID $DEV_PID)."
echo "🔗  Wait for Vite to print its local URL."
echo "⏹  Press Ctrl-C to stop."
echo "-------------------------------------------"

wait $DEV_PID
