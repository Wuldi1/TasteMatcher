import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./AppRoutes";

describe("AppRoutes legal pages", () => {
  it("renders the privacy policy without authentication", () => {
    render(
      <MemoryRouter initialEntries={["/privacy-policy"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Privacy Policy" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Google user data is not sold/i),
    ).toBeInTheDocument();
  });

  it("renders the terms of service without authentication", () => {
    render(
      <MemoryRouter initialEntries={["/terms-of-service"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Terms of Service" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Generated import files are intended for manual review/i),
    ).toBeInTheDocument();
  });
});
