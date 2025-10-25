# Common Package

The `common` package contains shared types and utilities used across both the frontend and backend components of the TasteMatcher application. 

## Structure

- **src/index.ts**: The main entry point that exports all shared types and classes.
- **src/types/**: Contains TypeScript definitions for various entities:
  - **artwork.ts**: Types related to artwork.
  - **domain.ts**: Types related to domains.
  - **session.ts**: Types related to user sessions.
  - **user.ts**: Types related to users.
- **src/test/BaseTestClass.ts**: A base test class providing shared testing utilities.

## Usage

This package is intended to be imported by both the backend and frontend applications to ensure consistency in type definitions and shared logic. 

## Installation

To install the dependencies for the common package, run:

```
pnpm install
```

## Testing

To run tests for the common package, use:

```
pnpm test
```

Ensure that you have the necessary testing framework set up in your environment.