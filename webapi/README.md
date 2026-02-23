# TasteMatcher Web API

## Overview

The API service for TasteMatcher is built with NestJS. It provides authentication, domain/user management, artwork/catalog endpoints, upload flows, sales/proposal endpoints, and health checks.

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+

### Installation

1. Navigate to the API directory:

   ```
   cd webapi
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

### Running the Application

To start the backend server, run the following command:

```
pnpm run build
pnpm run start:dev
```

The server will be available at `http://localhost:8080`.

### API Endpoints

- **GET /health**: Returns the health status of the application.

### Data/Service Configuration

This service uses Azure-backed services through shared `common` services (for example Cosmos DB and Blob Storage). Configure environment values via the files currently present in this package:

- `.env.local`
- `.env.dev`
- `.env.prd`

### Running Tests

To run the tests for the backend, use the following command:

```
pnpm run test
```

## Folder Structure

- `src/`: Contains the source code for the backend application.
  - `main.ts`: Entry point for the application.
  - `app.module.ts`: Main application module.
  - `health/`: Contains the health check controller.
- `build/`: Compiled JavaScript output.
- `README.md`: Documentation for the backend package.

## Contributing

Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.
