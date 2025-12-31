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

- Node.js 22+
- pnpm 8+

### Installation

```bash
cd frontend
pnpm install
```

### Development

```bash
# Start dev server
pnpm start

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

### Build

```bash
# Production build
pnpm build
```

## Project Structure

The frontend project is structured as follows:

- `src/`: Contains the source code for the frontend application.
  - `index.tsx`: The entry point for the React application.
  - `App.tsx`: The main application component (providers + routing).
  - `components/`: Contains reusable components.

## API Integration

The frontend communicates with the backend API. Ensure that the backend server is running to fetch data successfully.

## Contributing

If you would like to contribute to the frontend, please fork the repository and submit a pull request.

## License

This project is licensed under the MIT License.
