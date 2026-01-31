# In-House SDK Release Guide

This guide covers publishing `@sheenapps/db`, `@sheenapps/cms`, and `@sheenapps/auth`.

## Prereqs
- npm account with publish rights
- GitHub secret: `NPM_TOKEN`

## Workflow (Recommended)

Run the GitHub Actions workflow:

1. Go to Actions → "Publish In-House SDKs"
2. Choose which package(s) to publish
3. Run workflow

## Manual Publish (Local)

```
# @sheenapps/db
npm --prefix packages/db install
npm --prefix packages/db run build
npm --prefix packages/db publish --access public

# @sheenapps/cms
npm --prefix packages/cms install
npm --prefix packages/cms run build
npm --prefix packages/cms publish --access public

# @sheenapps/auth
npm --prefix packages/auth install
npm --prefix packages/auth run build
npm --prefix packages/auth publish --access public
```

## Notes
- Ensure `version` in each package.json is bumped before publish.
- Consider using npm provenance later if needed.
