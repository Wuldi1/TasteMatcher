import { BadRequestException, Injectable } from "@nestjs/common";
import { AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS } from "@tastematcher/common";

const SOURCE_HOSTS = new Set<string>(
  AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS.flatMap((provider) => [
    ...provider.sourceHosts,
  ]),
);
const IMAGE_HOSTS = new Set<string>(
  AUTOMATIC_UPLOAD_PROVIDER_DEFINITIONS.flatMap((provider) => [
    ...provider.imageHosts,
  ]),
);
const HTML_MAX_BYTES = 2 * 1024 * 1024;
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 5;

export interface SafeRemoteFetcherOptions {
  htmlMaxBytes?: number;
  imageMaxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

export type RemoteFetchFailureCode =
  | "invalid_url"
  | "redirect_blocked"
  | "too_many_redirects"
  | "timeout"
  | "network_error"
  | "http_error"
  | "unsupported_content_type"
  | "response_too_large";

export class RemoteFetchError extends Error {
  constructor(
    public readonly code: RemoteFetchFailureCode,
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "RemoteFetchError";
  }
}

export interface RemoteTextResponse {
  body: string;
  contentType: string;
  finalUrl: string;
}

export interface RemoteBinaryResponse {
  body: Buffer;
  contentType: string;
  finalUrl: string;
}

type RemoteResourceKind = "html" | "image";

/** Fetches allowlisted provider resources with redirect and byte controls. */
@Injectable()
export class SafeRemoteFetcher {
  private readonly options: Required<SafeRemoteFetcherOptions>;

  constructor(
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
    options: SafeRemoteFetcherOptions = {},
  ) {
    this.options = {
      htmlMaxBytes: options.htmlMaxBytes ?? HTML_MAX_BYTES,
      imageMaxBytes: options.imageMaxBytes ?? IMAGE_MAX_BYTES,
      timeoutMs: options.timeoutMs ?? REQUEST_TIMEOUT_MS,
      maxRedirects: options.maxRedirects ?? MAX_REDIRECTS,
    };
  }

  validateSourceUrl(value: string): URL {
    return this.validateUrl(value, "html");
  }

  validateImageUrl(value: string): URL {
    return this.validateUrl(value, "image");
  }

  async fetchHtml(value: string): Promise<RemoteTextResponse> {
    const response = await this.fetchResource(value, "html");
    return { ...response, body: response.body.toString("utf8") };
  }

  async fetchImage(value: string): Promise<RemoteBinaryResponse> {
    return this.fetchResource(value, "image");
  }

  private async fetchResource(
    value: string,
    kind: RemoteResourceKind,
  ): Promise<RemoteBinaryResponse> {
    let currentUrl = this.validateUrl(value, kind);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs,
    );

    try {
      for (
        let redirectCount = 0;
        redirectCount <= this.options.maxRedirects;
        redirectCount += 1
      ) {
        let response: Response;
        try {
          response = await this.fetchImpl(currentUrl, {
            method: "GET",
            redirect: "manual",
            signal: controller.signal,
            headers: {
              accept:
                kind === "html"
                  ? "text/html,application/xhtml+xml"
                  : "image/jpeg,image/png",
              "user-agent": "TasteMatcher-Automatic-Uploads/1.0",
            },
          });
        } catch (error) {
          if (controller.signal.aborted) {
            throw new RemoteFetchError(
              "timeout",
              "The remote provider request timed out.",
              true,
            );
          }
          throw new RemoteFetchError(
            "network_error",
            error instanceof Error
              ? `The remote provider request failed: ${error.message}`
              : "The remote provider request failed.",
            true,
          );
        }

        if (this.isRedirect(response.status)) {
          const location = response.headers.get("location");
          if (!location) {
            throw new RemoteFetchError(
              "redirect_blocked",
              "The remote provider returned a redirect without a location.",
            );
          }
          if (redirectCount === this.options.maxRedirects) {
            throw new RemoteFetchError(
              "too_many_redirects",
              "The remote provider returned too many redirects.",
            );
          }
          try {
            currentUrl = this.validateUrl(
              new URL(location, currentUrl).toString(),
              kind,
            );
          } catch (error) {
            if (error instanceof RemoteFetchError) throw error;
            throw new RemoteFetchError(
              "redirect_blocked",
              "The remote provider redirected to a URL that is not allowed.",
            );
          }
          continue;
        }

        if (!response.ok) {
          throw new RemoteFetchError(
            "http_error",
            `The remote provider returned HTTP ${response.status}.`,
            response.status === 429 || response.status >= 500,
          );
        }

        const contentType = (response.headers.get("content-type") ?? "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase();
        this.assertContentType(kind, contentType);
        const maxBytes =
          kind === "html"
            ? this.options.htmlMaxBytes
            : this.options.imageMaxBytes;
        let body: Buffer;
        try {
          body = await this.readLimitedBody(response, maxBytes);
        } catch (error) {
          if (
            controller.signal.aborted &&
            !(error instanceof RemoteFetchError)
          ) {
            throw new RemoteFetchError(
              "timeout",
              "The remote provider request timed out.",
              true,
            );
          }
          throw error;
        }
        return { body, contentType, finalUrl: currentUrl.toString() };
      }
      throw new RemoteFetchError(
        "too_many_redirects",
        "The remote provider returned too many redirects.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateUrl(value: string, kind: RemoteResourceKind): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException("A valid absolute URL is required.");
    }
    const allowedHosts = kind === "html" ? SOURCE_HOSTS : IMAGE_HOSTS;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !allowedHosts.has(url.hostname.toLowerCase())
    ) {
      throw new BadRequestException(
        kind === "html"
          ? "Only supported HTTPS auction URLs are allowed."
          : "The auction image URL is not allowed.",
      );
    }
    return url;
  }

  private assertContentType(
    kind: RemoteResourceKind,
    contentType: string,
  ): void {
    const allowed =
      kind === "html"
        ? new Set(["text/html", "application/xhtml+xml"])
        : new Set(["image/jpeg", "image/jpg", "image/png"]);
    if (!allowed.has(contentType)) {
      throw new RemoteFetchError(
        "unsupported_content_type",
        kind === "html"
          ? "The remote provider did not return an HTML document."
          : "The remote provider did not return a supported JPEG or PNG image.",
      );
    }
  }

  private async readLimitedBody(
    response: Response,
    maxBytes: number,
  ): Promise<Buffer> {
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new RemoteFetchError(
        "response_too_large",
        "The remote response exceeds the allowed size.",
      );
    }
    if (!response.body) return Buffer.alloc(0);

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RemoteFetchError(
          "response_too_large",
          "The remote response exceeds the allowed size.",
        );
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, totalBytes);
  }

  private isRedirect(status: number): boolean {
    return [301, 302, 303, 307, 308].includes(status);
  }
}
