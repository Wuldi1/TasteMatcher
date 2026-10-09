import { buildSimpleEmailHtml, EMAIL_TEMPLATES } from "./ManagementEmailWizard";

describe("ManagementEmailWizard templates", () => {
  it("renders the premium email shell with escaped content and legal links", () => {
    const preset = EMAIL_TEMPLATES[0].buildPreset({
      ctaUrl: "https://tastematcher.art/taster?source=email&kind=curated",
    });
    const html = buildSimpleEmailHtml({
      ...preset.draft,
      headline: "Art <considered>",
    });

    expect(html).toContain("background:#f6f4ef");
    expect(html).toContain("background:#344d40");
    expect(html).toContain("Art &lt;considered&gt;");
    expect(html).toContain("/privacy-policy");
    expect(html).toContain("/terms-of-service");
    expect(html).not.toContain("Art <considered>");
  });
});
