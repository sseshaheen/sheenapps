# Claude CLI Limitation - Cannot Spawn from Within Claude Code

## Issue Discovered

When attempting to spawn Claude CLI from within a Claude Code session, the spawned process is immediately terminated with exit code 143 (SIGTERM).

## Environment Detection

The following environment variables indicate we're running inside Claude Code:
- `CLAUDE_CODE_ENTRYPOINT=cli`
- `CLAUDECODE=1`

## Impact

This limitation prevents the stream-based architecture from working when the server is started from within a Claude Code session. The Claude CLI process is killed before it can produce any output.

## Workaround

To use the stream-based architecture:

1. **Run the server outside of Claude Code**: Start the server from a regular terminal, not from within Claude Code
2. **Use the modular architecture**: Switch back to `ARCH_MODE=modular` in the `.env` file
3. **Use a different AI provider**: Configure the system to use a different provider that doesn't have this limitation

## Technical Details

- Exit code: 143 (SIGTERM)
- Affects all Claude CLI invocations with spawn/exec
- Happens even with cleaned environment variables
- Likely a security mechanism to prevent recursive Claude sessions

## Recommended Solution

For development and testing within Claude Code, use:
```bash
ARCH_MODE=modular
```

For production deployment (outside Claude Code), use:
```bash
ARCH_MODE=stream
```

This ensures the system works correctly in both environments.