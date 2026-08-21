import { describe, expect, it } from "vitest";
import {
  getAutomaticUploadProviderDefinition,
  isAutomaticUploadProvider,
} from "./automatic-upload.types";

describe("automatic upload provider definitions", () => {
  it("detects a supported provider from its exact auction domain", () => {
    expect(
      getAutomaticUploadProviderDefinition(
        "https://www.phillips.com/auction/NY030826",
      ),
    ).toMatchObject({ provider: "phillips", displayName: "Phillips" });
    expect(isAutomaticUploadProvider("phillips")).toBe(true);
  });

  it("does not accept lookalike or unsupported domains", () => {
    expect(
      getAutomaticUploadProviderDefinition(
        "https://phillips.com.attacker.example/auction/NY030826",
      ),
    ).toBeUndefined();
    expect(
      getAutomaticUploadProviderDefinition("https://www.sothebys.com/auction"),
    ).toBeUndefined();
    expect(isAutomaticUploadProvider("sothebys")).toBe(false);
  });

  it("returns no provider for malformed URLs", () => {
    expect(getAutomaticUploadProviderDefinition("not a URL")).toBeUndefined();
  });

  it("accepts URL objects as well as strings", () => {
    expect(
      getAutomaticUploadProviderDefinition(
        new URL("https://phillips.com/auction/NY030826"),
      ),
    ).toMatchObject({ provider: "phillips" });
  });
});
