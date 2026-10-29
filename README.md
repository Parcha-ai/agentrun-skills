# agentrun-skills

Installable coding-agent workflows for hosted AgentRun, with progressive workflow references, MCP setup, origin-bound REST authentication and managed updates. Node 20+, no runtime dependencies.

Source repository: https://github.com/Parcha-ai/agentrun-skills. This package is not published to npm. `npm run build` generates the distributable assets in `dist/`. Serve those files at `/agentrun-skills/` on the selected preview or production console.

To build directly into an app checkout, use `npm run build -- --out /absolute/path/to/parcha-fe/public/agentrun-skills`. The standalone repository has no dependency on the Grep checkout.

First installation: download and review `<console>/agentrun-skills/install.mjs`, then `node install.mjs --source <console>/agentrun-skills`. Repeat that command or run `node ~/.agentrun-skills/current/scripts/cli.mjs update --source <console>/agentrun-skills` to update. Credentials are never bundled or overwritten. The `ensure` command checks updates and REST access; native MCP verification is performed by the coding-agent host.

Run `npm test` for isolated installer/auth behavior and `npm run build` to refresh distributable files after edits. Read the skill's setup reference for auth boundaries and headless OAuth prerequisites. No registry publication, paid runs, account provisioning or production changes are performed by building this package.

Workflow guidance is extracted from the console’s reviewed Brain-aligned handoffs. Agent construction remains hosted; the external coding agent takes over clarification and submission. Domain skills remain discoverable in the hosted library.

Updates run at task start, not as a background daemon. The release manifest and SHA-256 bundle must be regenerated after changes with `npm run build`; the console serves the generated public files. This checks download integrity, not an independent publisher signature.

## Development

```sh
npm test
npm run build
```

No dependency installation is required. The source skill is `skills/agentrun/SKILL.md`; authentication and update helpers are in `scripts/`. Generated bundles belong in `dist/`, not in source control.
