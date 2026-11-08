import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App", () => {
  it("shows the app name on the home route", () => {
    renderAt("/");
    expect(screen.getByRole("heading", { name: /rmfakecloud/i })).toBeInTheDocument();
  });

  it("has a main landmark for assistive technology", () => {
    renderAt("/");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("says so when a route does not exist", () => {
    renderAt("/no/such/page");
    expect(screen.getByRole("heading", { name: /not found/i })).toBeInTheDocument();
  });
});
