import { BadRequestException } from "@nestjs/common";
import { RemoteFetchError, SafeRemoteFetcher } from "./safe-remote-fetcher";

describe("SafeRemoteFetcher", () => {
  it.each([
    "http://www.phillips.com/auction/NY030826",
    "https://user@www.phillips.com/auction/NY030826",
    "https://www.phillips.com:444/auction/NY030826",
    "https://localhost/auction/NY030826",
    "https://phillips.com.evil.test/auction/NY030826",
  ])("rejects blocked source URL %s without fetching", async (url) => {
    const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
    const fetcher = new SafeRemoteFetcher(fetchMock);
    await expect(fetcher.fetchHtml(url)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates every redirect against the source allowlist", async () => {
    const fetchMock = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://example.com/private" },
        }),
      );
    const fetcher = new SafeRemoteFetcher(fetchMock);
    await expect(
      fetcher.fetchHtml("https://www.phillips.com/auction/NY030826"),
    ).rejects.toMatchObject({ code: "redirect_blocked" });
  });

  it("rejects unsupported content types and declared oversized bodies", async () => {
    const wrongType = new SafeRemoteFetcher(
      jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      wrongType.fetchHtml("https://www.phillips.com/auction/NY030826"),
    ).rejects.toMatchObject({ code: "unsupported_content_type" });

    const oversized = new SafeRemoteFetcher(
      jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(
        new Response("small", {
          status: 200,
          headers: { "content-type": "text/html", "content-length": "101" },
        }),
      ),
      { htmlMaxBytes: 100 },
    );
    await expect(
      oversized.fetchHtml("https://www.phillips.com/auction/NY030826"),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("enforces the streamed byte limit", async () => {
    const fetcher = new SafeRemoteFetcher(
      jest.fn<Promise<Response>, Parameters<typeof fetch>>().mockResolvedValue(
        new Response("123456", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
      { htmlMaxBytes: 5 },
    );
    await expect(
      fetcher.fetchHtml("https://www.phillips.com/auction/NY030826"),
    ).rejects.toMatchObject({ code: "response_too_large" });
  });

  it("aborts timed out requests", async () => {
    const fetchMock = jest
      .fn<Promise<Response>, Parameters<typeof fetch>>()
      .mockImplementation(
        (_input, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      );
    const fetcher = new SafeRemoteFetcher(fetchMock, { timeoutMs: 5 });
    await expect(
      fetcher.fetchHtml("https://www.phillips.com/auction/NY030826"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<RemoteFetchError>>({ code: "timeout" }),
    );
  });

  it.each([
    "https://dist.phillips.com/image.jpg",
    "https://assets.phillips.com/image.jpg",
  ])("accepts exact Phillips image host %s", (url) => {
    expect(new SafeRemoteFetcher().validateImageUrl(url).hostname).toBe(
      new URL(url).hostname,
    );
  });
});
