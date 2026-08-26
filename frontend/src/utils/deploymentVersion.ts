const DEFAULT_UI_VERSION = "v0.local";
const UNKNOWN_API_VERSION = "api?";

export function getUiDeploymentVersion(): string {
  return process.env.REACT_APP_UI_VERSION?.trim() || DEFAULT_UI_VERSION;
}

export function trimVersionPrefix(version: string): string {
  return version.replace(/^v0\./, "");
}

export function formatCombinedDeploymentVersion(
  uiVersion: string,
  apiVersion?: string,
): string {
  const normalizedUi = uiVersion.trim() || DEFAULT_UI_VERSION;
  const normalizedApi = apiVersion?.trim()
    ? trimVersionPrefix(apiVersion.trim())
    : UNKNOWN_API_VERSION;

  return `${normalizedUi}..${normalizedApi}`;
}
