import type { AutomaticUploadProvider } from "@tastematcher/common";

export interface AutomaticUploadProviderUiDefinition {
  provider: AutomaticUploadProvider;
  displayName: string;
  sourceHosts: readonly string[];
  sourcePathPattern: RegExp;
  exampleUrl: string;
}

// Keep this browser-safe catalog aligned when a backend parser is registered.
export const AUTOMATIC_UPLOAD_PROVIDER_UI_DEFINITIONS: readonly AutomaticUploadProviderUiDefinition[] =
  [
    {
      provider: "phillips",
      displayName: "Phillips",
      sourceHosts: ["phillips.com", "www.phillips.com"],
      sourcePathPattern: /^\/auctions?\/[A-Za-z0-9_-]+\/?$/i,
      exampleUrl: "https://www.phillips.com/auction/NY030826",
    },
  ];

export function getAutomaticUploadProviderUiDefinition(
  value: string | URL,
): AutomaticUploadProviderUiDefinition | undefined {
  let url: URL;
  try {
    url = typeof value === "string" ? new URL(value) : value;
  } catch {
    return undefined;
  }
  const hostname = url.hostname.toLowerCase();
  return AUTOMATIC_UPLOAD_PROVIDER_UI_DEFINITIONS.find((definition) =>
    definition.sourceHosts.includes(hostname) &&
    definition.sourcePathPattern.test(url.pathname),
  );
}
