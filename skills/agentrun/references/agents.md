# Create from a complete agent definition

For a natural-language build brief, follow build.md and use the hosted build capability. Use direct POST /api/v2/agents only when creating from a complete configuration, such as a reviewed playground request.

Read the original request, prior answers and template first. Establish the recurring job, per-run inputs, desired outputs and material success criteria. Ask only unresolved essentials, in 2–3 focused questions with concrete choices where helpful. Preserve prior answers and explicit defaults. Do not ask users to select internal models or tools. Clarify whether action workflows should propose or perform changes.

Discover the current schema, accessible skills and connections. Preserve supplied system instructions, input/output contracts and requested file formats; do not invent skill IDs or credentials. Validate the proposed definition. Complete setup and verify the intended personal/team account before a write; honor existing authorization. Submit through a supported MCP equivalent or POST /api/v2/agents. Report actual agent ID, draft/readiness state and console link. Creation does not imply a successful test run; perform one only if requested.
