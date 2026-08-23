# TasteMatcher

AI-powered art matching platform with semantic search and recommendation engine.

## Monorepo Structure

This project uses pnpm workspaces:

```
tastematcher
├── common
│   ├── src/                  # Shared types, services, and utilities
│   └── README.md
├── webapi
│   ├── src/                  # NestJS API modules and controllers
│   └── README.md
├── frontend
│   ├── src/                  # React app (routing, pages, components)
│   └── README.md
├── functions
│   ├── src/                  # Azure Functions handlers
│   └── README.md
├── scripts/                  # Data ingestion and utility scripts
├── pnpm-workspace.yaml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js 24 LTS (use the committed `.nvmrc`)
- pnpm 10 (the exact version is pinned in `package.json`)
- Azure CLI and `jq` when syncing the production-backed local profile

### Install

```bash
corepack enable
pnpm install --frozen-lockfile
```

### Run locally against production-backed data

Production data is live customer data. The sync command is read-only in Azure,
but API write endpoints still modify production. Authenticate to the approved
subscription, generate the ignored owner-only configuration, and then start the
local API and frontend. The command reuses a valid Azure CLI session, opens the
Microsoft login flow only when needed, and selects the approved subscription
automatically:

```bash
pnpm run start:local:production
```

The API runs on `http://localhost:8080` and the frontend on
`http://localhost:3000`. Local browser sessions always use the local API.
Functions are not started by this command because their triggers can consume
production queues; see `functions/README.md` for the guarded one-trigger opt-in.

To start only the already-synced production-backed API, run:

```bash
pnpm run start:local:webapi
```

### Build Targets

```bash
pnpm run build:webapi
pnpm run build:frontend
pnpm run build:functions
```

### Quality gates and deployment

Install dependencies once to activate the Husky hooks. Every commit runs
linting, type-checking, and all unit/component tests; every push additionally
runs every production build and repository safety validation:

```bash
pnpm run precommit:check
pnpm run prepush:check
pnpm run ci:check
```

Pull requests to `main` run the relevant component workflow without deploying.
After all gates pass, a matching push to `main` automatically deploys the
affected Web API, frontend, or Functions component to production and performs a
post-deployment health check. Manual workflow dispatch uses the same gates and
cannot bypass validation.

### Environment safety

- Never commit `webapi/.env.local-production` or
  `functions/local.settings.json`; the sync creates both with mode `600` and
  does not print their values.
- `webapi/.env.example` and `functions/local.settings.example.json` contain
  placeholders only.
- Previously tracked credentials must be rotated because deleting current
  files does not remove values from Git history.
- Production deployments are performed by the component GitHub Actions
  workflows: Flex Consumption Functions, Container Apps API, and Static Web
  Apps frontend.

## Sub-Agent Workflow

Use the following files to run multi-agent development flows:

1. `AGENTS.md` - Roles, handoff contract, and done criteria
2. `docs/context/project-context.md` - System and architecture context
3. `docs/context/sub-agent-flows.md` - Default execution flows
4. `docs/context/task-brief-template.md` - Reusable kickoff template
5. `docs/context/active-workstreams.md` - Team priorities and status
6. `docs/context/agents/html-parser-agent.md` - HTML to artworks parsing workflow

## Contributing

We welcome contributions to the TasteMatcher application! Please feel free to submit issues or pull requests.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
