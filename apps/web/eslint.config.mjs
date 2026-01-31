import eslintNextBase from "eslint-config-next";
import eslintNextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // Global ignores
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "**/*.d.ts",
      "scripts/**",
      "sanity.config.ts",
      "sanity.cli.ts",
    ]
  },
  // Next.js config (native flat config - no FlatCompat needed in v16+)
  // Base includes React hooks, core-web-vitals, etc.
  // TypeScript adds TS-specific rules
  ...eslintNextBase,
  ...eslintNextTypescript,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/exhaustive-deps": "warn",
      "react-hooks/rules-of-hooks": "error",
      // React Hooks 7.x rules: Enabled rules (0 violations, safe to enforce)
      "react-hooks/error-boundaries": "error",    // JSX in try/catch (fixed)
      "react-hooks/use-memo": "error",            // Missing useMemo (0 violations)
      // TEMPORARY: Disable high-violation rules from eslint-plugin-react-hooks 7.x
      // These require significant refactoring. Tracked for Phase 3 cleanup.
      // See: https://react.dev/blog/2024/04/25/react-19-upgrade-guide
      "react-hooks/set-state-in-effect": "off",   // Flags setState in useEffect (~63 instances)
      "react-hooks/immutability": "off",          // Flags direct state mutations
      "react-hooks/incompatible-library": "off",  // Flags outdated deps
      "react-hooks/preserve-manual-memoization": "off", // Flags overriding React Compiler
      "react-hooks/purity": "off",                // Flags side effects in render
      "react-hooks/refs": "off",                  // Flags ref access in render (~49 instances)
      "react-hooks/static-components": "off",     // Flags components defined in components
      "@next/next/no-img-element": "warn",
      // TEMPORARY: Allow console statements during P0 triage phase
      // TODO: Re-enable as error after logger migration (Phase 3)
      // "no-console": process.env.NODE_ENV === "production" ? "error" : "warn"
      "no-console": "warn",
      // TEMPORARY: Allow unescaped quotes in JSX during P0 triage phase
      // TODO: Fix unescaped entities in Phase 3 cleanup
      "react/no-unescaped-entities": "warn"
    }
  },
  {
    // Server contexts: Allow @/server/* imports, force migration from old service paths
    files: ["src/app/api/**/*.ts", "src/lib/actions/**/*.ts", "src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/services/worker-api-client", "@/services/version-management", "@/services/ai-time-billing", "@/services/preview-deployment", "@/services/project-export"],
            message: "Use @/server/services/* instead. These services have been moved to server-only modules."
          }
        ]
      }]
    }
  },
  {
    // Client contexts: Block all server imports to enforce proper architecture
    files: ["src/components/**/*.tsx", "src/hooks/**/*.ts", "src/app/**/page.tsx", "src/app/**/layout.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/server/*", "*/server/*"],
            message: "Client components cannot import server-only modules. Use API routes or server actions instead."
          },
          {
            group: ["@/services/worker-api-client", "@/services/version-management", "@/services/ai-time-billing", "@/services/preview-deployment", "@/services/project-export"],
            message: "Client components cannot import server services. Use API routes or the @/hooks/* equivalents instead."
          }
        ]
      }]
    }
  },
  {
    // Server-only Supabase architecture: Prevent client-side Supabase database access
    files: ["src/components/**/*.tsx", "src/hooks/**/*.ts", "src/pages/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@supabase/supabase-js"],
            importNames: ["createClient"],
            message: "CLIENT-SIDE SUPABASE ACCESS FORBIDDEN. Use server repositories only. See SERVER_ONLY_SUPABASE_ARCHITECTURE_PLAN.md"
          },
          {
            group: ["@/lib/supabase*"],
            message: "CLIENT-SIDE DATABASE ACCESS FORBIDDEN. Use server actions or API routes instead."
          }
        ]
      }],
      "no-restricted-globals": ["error",
        {
          name: "process",
          message: "CLIENT-SIDE PROCESS ACCESS FORBIDDEN. Use environment variables through Next.js config instead."
        }
      ]
    }
  },
  {
    // next-intl server/client API separation rules
    files: ["src/app/**/page.tsx", "src/app/**/layout.tsx", "src/server/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          {
            name: "next-intl",
            importNames: ["useTranslations", "useLocale", "useMessages"],
            message: "Server components must use 'next-intl/server' APIs: getTranslations(), getLocale(), getMessages(). Client hooks only work in 'use client' components."
          }
        ]
      }]
    }
  },
  {
    // Prevent server API imports in client components
    files: ["src/components/**/*.tsx", "src/hooks/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/server/*", "*/server/*"],
            message: "Client components cannot import server-only modules. Use API routes or server actions instead."
          }
        ],
        paths: [
          {
            name: "next-intl/server",
            message: "Client components cannot use server-only APIs. Use 'next-intl' hooks: useTranslations(), useLocale(), useMessages()."
          }
        ]
      }]
    }
  },
  {
    // i18n Configuration
    files: ["**/*.tsx", "**/*.ts"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.stories.tsx",
      "**/scripts/**",
      "**/*.config.ts",
      "**/packages/i18n-core/**"
    ],
    rules: {
      // Note: ESLint doesn't have built-in hardcoded string detection
      // Use these patterns to mark strings that need translation:
      // - Add // TODO: i18n comment for strings needing translation
      // - Use t() or getTranslations() for all user-facing text
      // - Allowed hardcoded strings:
      //   * aria-label, aria-describedby, data-testid
      //   * className, style, href, src, alt
      //   * Console messages and error logs
      //   * Configuration values and constants
    }
  }
];

export default eslintConfig;
