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

import { app } from '@azure/functions';
import * as ProcessImagesModule from './ProcessImagesFromBlob/ProcessImagesFromBlob';

// Try to call an explicit registration function if the module provides one.
// This makes registration explicit and provides a diagnostic log entry.
try {
  console.log('[functions] Starting function registrations...');

  // If the module exports a `register(app)` function, call it.
  // adding ignore linter for dynamic access
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (ProcessImagesModule as any).register === 'function') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ProcessImagesModule as any).register(app);
    console.log('[functions] Called register() on ProcessImagesFromBlob module.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } else if (typeof (ProcessImagesModule as any).default === 'function') {
    // If default export is a function that registers itself when called, call it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ProcessImagesModule as any).default(app);
    console.log('[functions] Called default() on ProcessImagesFromBlob module.');
  } else {
    // Importing the module may already register via top-level app.* calls.
    console.log('[functions] ProcessImagesFromBlob module imported; ensure it calls app.storageQueue(...) or app.* registration at module top-level.');
  }

  console.log('[functions] Function registration attempted.');
} catch (err) {
  console.error('[functions] Error during function registration:', err);
}

// Export any specific handlers for testing if needed
export * from './ProcessImagesFromBlob/ProcessImagesFromBlob';

// If using the v4 programming model, you do NOT need to export anything else here.
// Make sure your ProcessImagesFromBlob/ProcessImagesFromBlob.ts exports a handler as default or named export.
