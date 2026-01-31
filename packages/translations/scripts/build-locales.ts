#!/usr/bin/env tsx
/**
 * Build-time locale merging script.
 *
 * This script:
 * 1. Reads base locale files from src/base/{locale}/
 * 2. Applies regional overrides from src/overrides/{locale}/
 * 3. Writes merged output to src/generated/{locale}.json
 *
 * Regional locales (ar-eg, fr-ma) inherit from their base (ar, fr) and
 * only need to override strings that differ.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SUPPORTED_LOCALES,
  BASE_LOCALE_MAP,
} from '@sheenapps/platform-tokens';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BASE_DIR = path.join(ROOT, 'src/base');
const OVERRIDES_DIR = path.join(ROOT, 'src/overrides');
const GENERATED_DIR = path.join(ROOT, 'src/generated');

type Messages = Record<string, unknown>;

/**
 * Deep merge two objects. Source values override target values.
 */
function deepMerge(target: Messages, source: Messages): Messages {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = result[key];

    if (
      typeof sourceValue === 'object' &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === 'object' &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(
        targetValue as Messages,
        sourceValue as Messages
      );
    } else {
      result[key] = sourceValue;
    }
  }

  return result;
}

/**
 * Read all JSON files in a directory and merge them into a single object.
 */
function readLocaleDir(dir: string): Messages {
  if (!fs.existsSync(dir)) {
    return {};
  }

  const result: Messages = {};
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const namespace = path.basename(file, '.json');
    const content = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    result[namespace] = content;
  }

  return result;
}

/**
 * Build merged locale files.
 */
function build(): void {
  // Ensure generated directory exists
  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  let builtCount = 0;

  for (const locale of SUPPORTED_LOCALES) {
    const baseLocale = BASE_LOCALE_MAP[locale] ?? locale;

    // Start with base locale messages
    let messages = readLocaleDir(path.join(BASE_DIR, baseLocale));

    // If this is a regional variant, merge in the base locale first
    if (baseLocale !== locale) {
      const regionalBase = readLocaleDir(path.join(BASE_DIR, locale));
      messages = deepMerge(messages, regionalBase);
    }

    // Apply overrides if they exist
    const overrides = readLocaleDir(path.join(OVERRIDES_DIR, locale));
    if (Object.keys(overrides).length > 0) {
      messages = deepMerge(messages, overrides);
    }

    // Skip if no messages
    if (Object.keys(messages).length === 0) {
      console.log(`⚠️  Skipping ${locale} - no messages found`);
      continue;
    }

    // Write merged output
    const outputPath = path.join(GENERATED_DIR, `${locale}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(messages, null, 2));
    builtCount++;
    console.log(`✅ Built ${locale} (${Object.keys(messages).length} namespaces)`);
  }

  console.log(`\n📦 Built ${builtCount} locale bundles`);
}

build();
