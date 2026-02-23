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

- Node.js 22+
- pnpm 10+

### Install

```bash
pnpm install
```

### Run the API

```bash
pnpm run start:dev:webapi
```

API runs on `http://localhost:8080`.

### Run the Frontend

```bash
pnpm run start:frontend
```

### Build Targets

```bash
pnpm run build:webapi
pnpm run build:frontend
pnpm run build:functions
```

### Environment Notes

- Root `.env.example`: Not found in repo.
- `scripts/dev.sh`: Not found in repo.
- API env files currently present in `webapi/`: `.env.local`, `.env.dev`, `.env.prd`.

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
