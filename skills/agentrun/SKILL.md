---
name: agentrun
description: Build and run hosted AgentRun agents, swarms and loops, author skills, and inspect results or usage through authenticated MCP or the AgentRun v2 API. Use for AgentRun console handoffs and management from a coding agent.
---

# AgentRun

AgentRun hosts execution; this coding agent handles clarification and API/MCP operations. The console manages and observes work. No enterprise Runner or local model runtime is required.

## Before every task

1. Use the API and console origins supplied by the user/console; do not substitute production for a preview. Read [setup.md](references/setup.md). Ensure the package is current, reuse a working connection and verify access with a read-only call. Installing a skill is not authentication. A browser login/team selection does not authenticate this coding agent.
2. Read only the relevant workflow below. Inspect existing conversation and supplied context before asking questions. Do not repeat answered questions. Ask focused material gaps with concrete choices/defaults, using the host's question tool where available. Honor existing authorization; do not add routine confirmation steps to complete requests.
3. Discover actual native MCP tools and schemas. Prefer an authenticated MCP connection for this environment when it supports the operation. Otherwise use an authenticated v2 SDK/API connection for the same account. Never assume tool names, SDK methods, token audiences or permissions. REST endpoint names below describe capabilities; an MCP equivalent must have the same semantics. Don't send REST credentials to MCP.
4. Preserve user inputs, templates, source documents, account, output formats and action intent. No secrets in prompts or copied code. Inspect returned state; report actual IDs, results and console links. After ambiguous write failures, inspect existing state before retrying to avoid duplicate work.

## Workflows

- Describe and build a hosted agent: [build.md](references/build.md).
- Create from a complete agent definition: [agents.md](references/agents.md).
- Run an agent: [runs.md](references/runs.md).
- Create a swarm: [swarms.md](references/swarms.md).
- Create a recurring loop: [loops.md](references/loops.md).
- Author a reusable platform skill: [skills.md](references/skills.md).
- Inspect Mission Control or query run history: [observe.md](references/observe.md).
- Perform an exact playground operation: [playground.md](references/playground.md), plus its matching workflow when relevant.

Use a local AGENTRUN_API_KEY or AGENTRUN_ACCESS_TOKEN only with the explicitly matching AGENTRUN_API_ORIGIN. Prefer SDK helpers supported by the current installed SDK. Read the selected environment's /api/v2/openapi.json for REST contracts. Legacy names such as expert_id may still be wire fields; do not rename them based on UI labels.

Keep broad domain skills in the hosted skills library; discover and attach them as needed. Do not install hundreds of research skills into the user's coding agent or expose internal-only Brain tools as public APIs.
