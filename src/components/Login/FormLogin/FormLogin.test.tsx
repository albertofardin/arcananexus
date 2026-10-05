import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import FormLogin from "./FormLogin";
import { render } from "@/test/helpers/test-utils";

// I campi `FieldText` sottostanti debounciano `onChange` di 500ms (vedi
// src/components/_core/FieldText/FieldText.tsx): i `waitFor` qui usano un
// timeout maggiorato per dare tempo al debounce di scattare. Il bottone
// "ACCEDI" espone `role="button"` solo quando abilitato (vedi BtnBase.tsx,
// role="presentation" quando disabilitato): usiamo questo per verificare lo
// stato di submit senza toccare i componenti presentazionali.
const DEBOUNCE_TIMEOUT = 2000;

describe("FormLogin", () => {
  it("disabilita il submit finché username e password non sono compilati", async () => {
    render(
      <FormLogin
        onRequest={vi.fn()}
        onClickRegistration={vi.fn()}
        onClickForgotPassword={vi.fn()}
        hiddenTenant
      />
    );

    expect(
      screen.queryByRole("button", { name: /ACCEDI/ })
    ).not.toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText("email@dominio.com oppure nome utente"),
      { target: { value: "marietto" } }
    );
    fireEvent.change(screen.getByPlaceholderText("******"), {
      target: { value: "secret123" },
    });

    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: /ACCEDI/ })
        ).toBeInTheDocument(),
      { timeout: DEBOUNCE_TIMEOUT }
    );
  });

  it("mostra l'errore quando la richiesta fallisce", async () => {
    const onRequest = vi.fn().mockResolvedValue({
      success: false,
      message: ["Invalid email or password"],
    });

    render(
      <FormLogin
        onRequest={onRequest}
        onClickRegistration={vi.fn()}
        onClickForgotPassword={vi.fn()}
        hiddenTenant
      />
    );

    fireEvent.change(
      screen.getByPlaceholderText("email@dominio.com oppure nome utente"),
      { target: { value: "marietto" } }
    );
    fireEvent.change(screen.getByPlaceholderText("******"), {
      target: { value: "wrong" },
    });

    const submitButton = await waitFor(
      () => screen.getByRole("button", { name: /ACCEDI/ }),
      { timeout: DEBOUNCE_TIMEOUT }
    );
    // `BtnBase` distingue singolo/doppio click da `event.detail` (1 vs 2):
    // `fireEvent.click` di jsdom non lo imposta di default (vedi lo stesso
    // pattern in CharacterCreation.test.tsx).
    fireEvent.click(submitButton, { detail: 1 });

    await waitFor(() => {
      expect(onRequest).toHaveBeenCalledWith({
        tenantId: "",
        username: "marietto",
        password: "wrong",
        rememberMe: false,
      });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid email or password"
    );
  });
});
