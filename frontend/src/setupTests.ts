import "@testing-library/jest-dom";

if (!globalThis.structuredClone) {
  globalThis.structuredClone = <T>(value: T): T =>
    JSON.parse(JSON.stringify(value)) as T;
}

Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  value: jest.fn(() => "blob:test-artwork"),
});
Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  value: jest.fn(),
});
