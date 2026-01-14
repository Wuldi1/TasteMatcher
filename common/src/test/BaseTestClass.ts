/// <reference lib="dom" />

export interface TestConfig {
  defaultDomainId?: string;
}

/**
 * BaseTestClass - shared test helpers for BE and FE
 */
export class BaseTestClass {
  protected apiBaseUrl: string;

  constructor(apiBaseUrl: string) {
    this.apiBaseUrl = apiBaseUrl;
  }

  protected async fetchJson(url: string, options?: RequestInit) {
    const response = await fetch(`${this.apiBaseUrl}${url}`, options);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
}
