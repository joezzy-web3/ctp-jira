---
inclusion: always
---
# Tech

- Atlassian Forge (Node 22 runtime), Custom UI (React) for the issue panel and JSM portal, UI themes via CSS variables.
- Forge modules: jira:workflowValidator, jira:issuePanel, jiraServiceManagement portal module, scheduledTrigger, Forge storage (KVS), rovo:agent with actions, rovo:mcp.
- Signatures: WebCrypto Ed25519 in the browser; node:crypto verify in Forge functions.
- Tests: vitest for units and named attack tests; fast-check property tests (e.g. "no input lets an AI reading alone clear a payment"); integration tests against cleartopay.atlassian.net.
- Environment: Ubuntu (WSL) bash, Node 22 via nvm, project at ~/ctp-jira. Commit after every working session.
- Planned: replace Create React App with Vite in static/.
