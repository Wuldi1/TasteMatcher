import {
  JSON_BODY_LIMIT_BYTES,
  configureHttpBodyParsers,
} from "../http-body-parser";

describe("configureHttpBodyParsers", () => {
  it("registers bounded non-multipart parsers at 2 MiB", () => {
    const app = { useBodyParser: jest.fn() };
    configureHttpBodyParsers(app as never);
    expect(JSON_BODY_LIMIT_BYTES).toBe(2 * 1024 * 1024);
    expect(app.useBodyParser).toHaveBeenCalledTimes(2);
    expect(app.useBodyParser).toHaveBeenCalledWith("json", {
      limit: 2 * 1024 * 1024,
    });
    expect(app.useBodyParser).toHaveBeenCalledWith("urlencoded", {
      extended: true,
      limit: 2 * 1024 * 1024,
    });
    expect(app.useBodyParser).not.toHaveBeenCalledWith(
      "raw",
      expect.anything(),
    );
  });
});
