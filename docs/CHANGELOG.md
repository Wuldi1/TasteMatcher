# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Functions Service**: New Azure Functions service for asynchronous image processing
  - `ProcessImagesFromBlob` queue trigger for thumbnail generation and vectorization
  - Thumbnail service generating 3 sizes (150px, 400px, 800px) with Sharp
  - Vectorization service using Azure AI Vision for semantic embeddings
  - Exponential backoff retry logic with configurable parameters
  - Idempotency checks to prevent duplicate processing
  - Structured logging with correlation IDs and request tracing
  - Comprehensive unit and integration tests (TDD approach)
  - Integration with Azure Cognitive Search for vector indexing
  - Configuration management with environment variable validation
  - Dead-letter queue handling for failed messages

### Changed
- Extended `@tastematcher/common` with image processing types:
  - `ImageProcessingQueueMessage` for queue contracts
  - `ThumbnailResult`, `ImageVectorResult`, `ImageProcessingResult`
  - `ImageProcessingError` for structured error handling

<!-- ...existing changelog entries... -->
