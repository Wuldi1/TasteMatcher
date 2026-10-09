import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LegalPage } from "./LegalPage";

describe("LegalPage", () => {
  it("provides section navigation and linked contact information", () => {
    render(
      <MemoryRouter>
        <LegalPage kind="privacy" />
      </MemoryRouter>,
    );

    expect(
      screen.getAllByRole("navigation", { name: "Privacy Policy sections" }),
    ).toHaveLength(2);
    expect(
      screen.getAllByRole("link", { name: "Information We Collect" })[0],
    ).toHaveAttribute("href", "#section-information-we-collect");
    expect(
      screen.getAllByRole("link", { name: "admin@tastematcher.com" })[0],
    ).toHaveAttribute("href", "mailto:admin@tastematcher.com");
  });
});
