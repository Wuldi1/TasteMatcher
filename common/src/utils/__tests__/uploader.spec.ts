// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------

import { BlobServiceClient } from '@azure/storage-blob';
import { downloadBlob, uploadBuffer, blobExists } from '../uploader';

jest.mock('@azure/storage-blob');
jest.mock('@azure/identity');
jest.mock('../logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  })),
}));

const mockClient = {
  getContainerClient: jest.fn(),
};

(BlobServiceClient as unknown as jest.Mock).mockReturnValue(mockClient);

describe('uploader utils', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.AZURE_STORAGE_ACCOUNT = 'testacct';
    mockClient.getContainerClient.mockReturnValue({
      getBlockBlobClient: jest.fn().mockReturnValue({
        download: jest.fn().mockResolvedValue({
          readableStreamBody: (async function* () {
            yield Buffer.from('hello');
          })(),
        }),
        uploadData: jest.fn().mockResolvedValue(undefined),
        url: 'https://example.blob',
        exists: jest.fn().mockResolvedValue(true),
      }),
      createIfNotExists: jest.fn().mockResolvedValue(undefined),
      getBlobClient: jest.fn().mockReturnValue({
        exists: jest.fn().mockResolvedValue(true),
      }),
    });
  });

  it('downloads blob', async () => {
    const buf = await downloadBlob('container', 'blob');
    expect(buf.toString()).toBe('hello');
  });

  it('uploads buffer', async () => {
    const url = await uploadBuffer('container', 'blob', Buffer.from('hello'), 'text/plain');
    expect(url).toBe('https://example.blob');
  });

  it('checks existence', async () => {
    const exists = await blobExists('container', 'blob');
    expect(exists).toBe(true);
  });
});
