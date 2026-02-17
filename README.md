# TasteMatcher

AI-powered art matching platform with semantic search and recommendation engine.

## Monorepo Structure

This project uses pnpm workspaces:

```
tastematcher
├── common
│   ├── package.json          # Configuration for shared types and utilities
│   ├── tsconfig.json         # TypeScript configuration for common package
│   ├── src
│   │   ├── index.ts          # Entry point for shared code
│   │   ├── types             # Type definitions
│   │   │   ├── artwork.ts    # Types related to artwork
│   │   │   ├── domain.ts     # Types related to domains
│   │   │   └── user.ts       # Types related to users
│   │   └── test
│   │       └── BaseTestClass.ts # Shared testing utilities
│   └── README.md             # Documentation for the common package
├── backend
│   ├── package.json          # Configuration for backend package
│   ├── tsconfig.json         # TypeScript configuration for backend package
│   ├── src
│   │   ├── main.ts           # Entry point for the backend application
│   │   ├── app.module.ts     # Main application module
│   │   ├── health
│   │   │   └── health.controller.ts # Health check endpoint
│   │   ├── test
│   │   │   └── test.controller.ts   # Test endpoint
│   └── prisma
│       └── schema.prisma     # Prisma schema for the database
│   └── README.md             # Documentation for the backend package
├── frontend
│   ├── package.json          # Configuration for frontend package
│   ├── tsconfig.json         # TypeScript configuration for frontend package
│   ├── index.html            # Main HTML file for the frontend application
│   ├── src
│   │   ├── main.tsx          # Entry point for the frontend application
│   │   ├── App.tsx           # Main App component
│   │   └── components
│   │       └── HelloFetch.tsx # Component to fetch data from the backend
│   └── README.md             # Documentation for the frontend package
├── scripts
│   └── dev.sh                # Shell script to run both applications concurrently
├── pnpm-workspace.yaml       # Configuration for pnpm workspace
├── package.json              # Root configuration file for the project
├── .env.example               # Example environment configuration
└── README.md                 # Main documentation for the entire project
```

## Getting Started

To get started with the TasteMatcher application, follow these steps:

1. **Clone the Repository**: Clone this repository to your local machine.
2. **Install Dependencies**: Navigate to the root directory and run `pnpm install` to install all necessary dependencies for the project.
3. **Set Up Environment Variables**: Copy `.env.example` to `.env` and configure your environment variables as needed.
4. **Run the Application**: Use the provided `scripts/dev.sh` to start both the backend and frontend applications concurrently.

## Sub-Agent Workflow

Use the following files to run multi-agent development flows:

1. `AGENTS.md` - Roles, handoff contract, and done criteria
2. `docs/context/project-context.md` - System and architecture context
3. `docs/context/sub-agent-flows.md` - Default execution flows
4. `docs/context/task-brief-template.md` - Reusable kickoff template
5. `docs/context/active-workstreams.md` - Team priorities and status
6. `docs/context/agents/html-parser-agent.md` - HTML to artworks parsing workflow

## New: Sales page (dealer flow)

We added a new Sales page (frontend/src/pages/SalesPage.tsx) that provides:

- User selector (dropdown)
- Tabs: Details, Catalog, AI Suggestions, Sale Proposal

Backend endpoints (skeleton) were added under backend/src/sales:

- GET /domains/:domainId/sales/users
- GET /domains/:domainId/sales/catalog?userId=&hasFeedback=
- GET /domains/:domainId/sales/ai-suggestions?userId=&limit=
- POST /domains/:domainId/sales/proposals
- GET /domains/:domainId/sales/proposals/:proposalId

Please wire the controller to your existing services (UserService, CatalogService, AISuggestionService, ProposalService) and update frontend Catalog usage to reuse the existing Catalog component by passing userId and hasFeedback filter.

## Contributing

We welcome contributions to the TasteMatcher application! Please feel free to submit issues or pull requests.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
