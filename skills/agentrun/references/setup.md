# Installation, updates and access

## Installation

Use the console origin from the handoff. Fetch `<console-origin>/agentrun-skills/install.mjs` to a temporary local file, inspect it, then run it with Node 20+ and `--source <console-origin>/agentrun-skills`. Do not pipe a remote script into a shell. The installer writes `~/.agentrun-skills/current` and discoverable skill links for Claude Code, Codex/common agents and Cursor. It leaves unrelated configuration and existing user-owned skill folders intact. If a name collision is reported, read `~/.agentrun-skills/current/skills/agentrun/SKILL.md` directly instead of overwriting it. Reload skill discovery if the host needs it; the current task can read the file directly.

Run `node ~/.agentrun-skills/current/scripts/cli.mjs update --source <console-origin>/agentrun-skills` at task start. It checks the versioned manifest and updates managed files, preserving credentials and user files. If it updated, re-read the entrypoint and current workflow. Network failure leaves the installed version usable and must be disclosed; installation success alone is not authenticated access.

## Prefer an existing MCP connection

Discover native MCP tools and connection status for `<api-origin>/api/v2/mcp`. Reuse an authenticated connection; verify with a read-only quota tool if available. Discover current tool names and schemas rather than assuming a fixed tool count. No REST token is needed if MCP can perform the requested task.

If MCP is missing, offer MCP setup or REST access without replacing a working connection. For Claude Code, the existing Grep-compatible command is `claude mcp add --transport http --scope project agentrun <api-origin>/api/v2/mcp`, then `/mcp` for the host's OAuth flow. Other clients should use their native remote MCP configuration and authentication UI. Preserve unrelated MCP settings. Registration may require reconnecting/restarting discovery. Only a successful authenticated tool call verifies readiness. MCP OAuth is for `/api/v2/mcp`; a REST API key, REST OAuth token or legacy email-OTP JWT is not interchangeable. Do not extract tokens from another client's configuration.

## REST/API readiness

For an existing credential, set AGENTRUN_API_ORIGIN to the exact API origin and supply AGENTRUN_API_KEY or AGENTRUN_ACCESS_TOKEN securely through the user's environment. Never ask for secrets in chat. Run:

```sh
node ~/.agentrun-skills/current/scripts/cli.mjs ensure --api-origin <api-origin> --source <console-origin>/agentrun-skills
```

This checks updates then uses GET /api/v2/quota. It reports access, quota/account details and authentication method without the token. It does not start jobs or claim all scopes are granted. Confirm the intended personal/team account from the user's context and actual credential; if identity is not returned by the endpoint, say account matching is unverified and resolve it before writes. A 403 is a scope/role problem, not proof that signup is required. A 402 requires inspecting funding. Do not purchase credits automatically. Do not require Grep's browser onboarding questionnaire for a working AgentRun credential.

If no credential works, the helper reports `setup_required` and discovery information. Configure MCP through the host, use the console API keys page, or use the headless flow below when supported. A fresh guest identity is not the user's existing team and must not be substituted silently.

## Headless OAuth

For a provisioned service identity, set AGENTRUN_CLIENT_ID and supply its secret as a mode-0600 file containing `{"client_secret":"..."}` (outside the repository). Then:

```sh
node ~/.agentrun-skills/current/scripts/cli.mjs login --api-origin <api-origin> --client-secret-file <private-file>
```

The helper discovers the API's protected-resource metadata and its advertised authorization server, requires `client_credentials` in issuer metadata, and exchanges at that issuer's token endpoint with resource `<api-origin>/api/v2`. It never follows credential-bearing redirects. It stores the returned token privately, bound to this origin, and verifies quota access. This is an exchange for an existing service identity, not self-service provisioning. If the API advertises no issuer, the grant is unavailable, or provisioning is required, report that limitation and use a supported setup route. Do not invent a bootstrap endpoint or send a token minted for MCP to REST. An expired cached token requires another exchange; do not claim automatic refresh without a refresh mechanism.

For REST calls after login, load the origin-bound token inside the request process using the exported `credential({origin, home, env})` helper from `~/.agentrun-skills/current/scripts/cli.mjs`, and pass its `token` to the SDK or Authorization header. Do not print the returned object, read the credential file into the conversation, or persist the secret in generated code. The helper returns null for expired tokens.

Re-run readiness after setup and resume the original task. Keep authentication, account scope, required operation permissions and available funding as distinct checks. Do not treat unknown status as ready or loop indefinitely on failures.
