# TasteMatcher Backend

## Overview
The backend of the TasteMatcher application is built using NestJS, a progressive Node.js framework for building efficient and scalable server-side applications. This backend serves as the API layer for the application, handling requests and responses, and interacting with the database.

## Getting Started

### Prerequisites
- Node.js (20.x LTS)
- pnpm (latest version)

### Installation
1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   pnpm install
   ```

### Running the Application
To start the backend server, run the following command:
```
pnpm run start
```
The server will be available at `http://localhost:3000`.

### API Endpoints
- **GET /health**: Returns the health status of the application.
- **GET /test**: Returns a sample payload from the common package.

### Database Configuration
The backend uses Prisma as an ORM to interact with the database. The database connection is configured in the `prisma/schema.prisma` file. By default, it uses SQLite for local development.

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
  - `test/`: Contains the test controller.
- `prisma/`: Contains the Prisma schema and migration files.
- `README.md`: Documentation for the backend package.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for details.