/**
 * Codegen script: generates src/i18n/message-loader.ts
 *
 * Reads the messages/{locale}/*.json directory structure and produces
 * a static import map that Turbopack can resolve at build time.
 *
 * Run: npx tsx scripts/generate-message-loader.ts
 *      npm run generate:i18n
 */

import fs from 'fs'
import path from 'path'

const MESSAGES_DIR = path.resolve(__dirname, '../src/messages')
const OUTPUT_FILE = path.resolve(__dirname, '../src/i18n/message-loader.ts')

// Locales to include (skip deprecated-en-xa)
const SKIP_LOCALES = new Set(['deprecated-en-xa'])

function main() {
  const locales = fs
    .readdirSync(MESSAGES_DIR)
    .filter((d) => {
      if (SKIP_LOCALES.has(d)) return false
      return fs.statSync(path.join(MESSAGES_DIR, d)).isDirectory()
    })
    .sort()

  const lines: string[] = [
    '// AUTO-GENERATED — do not edit manually.',
    '// Run: npm run generate:i18n',
    '// Source: scripts/generate-message-loader.ts',
    '',
    '/* eslint-disable @typescript-eslint/no-explicit-any */',
    '',
    'type MessageModule = { default: Record<string, any> }',
    'type Loader = () => Promise<MessageModule>',
    '',
    'const messageLoaders: Record<string, Record<string, Loader>> = {',
  ]

  for (const locale of locales) {
    const localeDir = path.join(MESSAGES_DIR, locale)
    const namespaces = fs
      .readdirSync(localeDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()

    // Quote locale keys that contain hyphens
    const localeKey = locale.includes('-') ? `'${locale}'` : locale
    lines.push(`  ${localeKey}: {`)

    for (const ns of namespaces) {
      // Quote namespace keys that contain hyphens
      const nsKey = ns.includes('-') ? `'${ns}'` : ns
      lines.push(
        `    ${nsKey}: () => import('../messages/${locale}/${ns}.json'),`
      )
    }

    lines.push('  },')
  }

  lines.push('}')
  lines.push('')
  lines.push(
    'export async function loadNamespace(locale: string, ns: string): Promise<Record<string, any>> {'
  )
  lines.push('  const localeLoaders = messageLoaders[locale]')
  lines.push('  if (!localeLoaders?.[ns]) {')
  lines.push("    if (process.env.NODE_ENV === 'development') {")
  lines.push(
    '      console.warn(`[i18n] Namespace "${ns}" not found for locale "${locale}"`)'
  )
  lines.push('    }')
  lines.push('    return {}')
  lines.push('  }')
  lines.push('  return (await localeLoaders[ns]()).default')
  lines.push('}')
  lines.push('')
  lines.push('export function hasNamespace(locale: string, ns: string): boolean {')
  lines.push('  return !!messageLoaders[locale]?.[ns]')
  lines.push('}')
  lines.push('')
  lines.push('export function getLocales(): string[] {')
  lines.push('  return Object.keys(messageLoaders)')
  lines.push('}')
  lines.push('')
  lines.push('export function getNamespaces(locale: string): string[] {')
  lines.push('  return Object.keys(messageLoaders[locale] ?? {})')
  lines.push('}')
  lines.push('')

  fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf-8')

  // Stats
  const totalImports = locales.reduce((sum, locale) => {
    const count = fs
      .readdirSync(path.join(MESSAGES_DIR, locale))
      .filter((f) => f.endsWith('.json')).length
    return sum + count
  }, 0)

  console.log(
    `Generated ${OUTPUT_FILE} — ${locales.length} locales, ${totalImports} static imports`
  )
}

main()
