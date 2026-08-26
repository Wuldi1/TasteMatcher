import {
  formatCombinedDeploymentVersion,
  trimVersionPrefix,
} from "./deploymentVersion";

describe("deployment version formatting", () => {
  it("combines UI and API deployment versions in the compact display format", () => {
    expect(formatCombinedDeploymentVersion("v0.8.25", "v0.8.24")).toBe(
      "v0.8.25..8.24",
    );
  });

  it("preserves same-day deployment ordinals", () => {
    expect(formatCombinedDeploymentVersion("v0.8.25.2", "v0.8.24")).toBe(
      "v0.8.25.2..8.24",
    );
  });

  it("shows unknown API version when the backend has not exposed deployment metadata", () => {
    expect(formatCombinedDeploymentVersion("v0.8.25")).toBe("v0.8.25..api?");
  });

  it("trims only the canonical v0 prefix from secondary component versions", () => {
    expect(trimVersionPrefix("v0.8.24.2")).toBe("8.24.2");
    expect(trimVersionPrefix("v1.0.0")).toBe("v1.0.0");
  });
});
