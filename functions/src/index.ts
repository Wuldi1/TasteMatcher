// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Entry point for Azure Functions app
// 2. Registers all function handlers
// 3. Initializes shared services and configuration
// -----------------------------------------------------------

/**
 * Azure Functions App Entry Point
 * 
 * This file registers all function handlers and initializes
 * the Azure Functions runtime for the Node.js v4 programming model.
 * 
 * All function registrations happen in their respective modules,
 * but we import them here to ensure they're loaded.
 */

// Import function registrations (this triggers app.storageQueue() calls)
import './ProcessImagesFromBlob/ProcessImagesFromBlob';

// Export for testing if needed
export * from './ProcessImagesFromBlob/ProcessImagesFromBlob';
