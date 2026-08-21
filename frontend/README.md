# TasteMatcher Frontend

React + TypeScript (Create React App) frontend for the TasteMatcher art recommendation platform.

## Features

- ✅ **Responsive Navigation** - Bottom nav (mobile) / Left sidebar (desktop)
- ✅ **Home Dashboard** - Domain stats and quick actions
- ✅ **Artwork Upload** - Drag-and-drop file upload
- ✅ **Catalog Gallery** - Grid view with lazy loading and search
- ✅ **Taster** - Tinder-style swipe interface for building taste profiles
- ✅ **Accessibility** - WCAG AA compliant with keyboard navigation
- ✅ **Authentication** - JWT-based auth with protected routes

## Getting Started

### Prerequisites

- Node.js 24 LTS
- pnpm (use the workspace version managed by Corepack)

### Installation

```bash
corepack enable
pnpm install
```

### Development

```bash
# From the repository root, start the local API first (port 8080), then:
pnpm --filter @tastematcher/frontend start

# Run tests
pnpm --filter @tastematcher/frontend test --runInBand

# Type checking
pnpm --filter @tastematcher/frontend typecheck

# Linting
pnpm --filter @tastematcher/frontend lint
```

### Build

```bash
# Production build
pnpm --filter @tastematcher/frontend build
```

## Project Structure

The frontend project is structured as follows:

- `src/`: Contains the source code for the frontend application.
  - `index.tsx`: The entry point for the React application.
  - `App.tsx`: The main application component (providers + routing).
  - `components/`: Contains reusable components.

## API Integration

The local frontend always calls `http://localhost:8080`. Copy `.env.example` to
`.env.local` only if you need the documented local setting; both files contain
an API URL, never database credentials. The local Web API owns the separately
configured, production-backed data connection.

Production builds use `https://api.tastematcher.art`. The deployment workflow
targets only the `prd` GitHub environment and `tastematcher-prd-web` App Service.

## Contributing

If you would like to contribute to the frontend, please fork the repository and submit a pull request.

## License

This project is licensed under the MIT License.
