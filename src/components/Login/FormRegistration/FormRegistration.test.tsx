import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import FormRegistration from "./FormRegistration";
import { render } from "@/test/helpers/test-utils";

// I campi `FieldText` sottostanti debounciano `onChange` di 500ms (vedi
// src/components/_core/FieldText/FieldText.tsx): i `waitFor` qui usano un
// timeout maggiorato. Il bottone "CONFERMA" espone `role="button"` solo
// quando abilitato (vedi BtnBase.tsx, role="presentation" quando
// disabilitato): usiamo questo per verificare lo stato di submit senza
// toccare i componenti presentazionali.
const DEBOUNCE_TIMEOUT = 2000;
// Soddisfa PWD_POLICY (minimo 8 caratteri, almeno un numero).
const VALID_PASSWORD = "Password1";

const fillMandatoryFields = () => {
  fireEvent.change(screen.getByPlaceholderText("email@dominio.com"), {
    target: { value: "mario@example.com" },
  });
  fireEvent.change(
    screen.getByPlaceholderText("username per accedere (non nome PG)"),
    { target: { value: "marietto" } }
  );
  const [passwordOne, passwordTwo] = screen.getAllByPlaceholderText("******");
  fireEvent.change(passwordOne, { target: { value: VALID_PASSWORD } });
  fireEvent.change(passwordTwo, { target: { value: VALID_PASSWORD } });
  fireEvent.click(
    screen.getByText("Dichiaro di aver letto ed aderire alla Privacy Policy"),
    { detail: 1 }
  );
  fireEvent.click(
    screen.getByText(
      "Dichiaro di dare il mio consenso al trattamento dei dati personali fornitovi"
    ),
    { detail: 1 }
  );
};

describe("FormRegistration", () => {
  it("disabilita il submit finché il form non è compilato", async () => {
    render(<FormRegistration goBack={vi.fn()} onRequest={vi.fn()} />);

    expect(
      screen.queryByRole("button", { name: /CONFERMA/ })
    ).not.toBeInTheDocument();

    fillMandatoryFields();

    await waitFor(
      () =>
        expect(
          screen.getByRole("button", { name: /CONFERMA/ })
        ).toBeInTheDocument(),
      { timeout: DEBOUNCE_TIMEOUT }
    );
  });

  it("mostra il messaggio di successo quando la registrazione riesce", async () => {
    const onRequest = vi.fn().mockResolvedValue({ success: true, message: [] });

    render(<FormRegistration goBack={vi.fn()} onRequest={onRequest} />);

    fillMandatoryFields();

    const submitButton = await waitFor(
      () => screen.getByRole("button", { name: /CONFERMA/ }),
      { timeout: DEBOUNCE_TIMEOUT }
    );
    fireEvent.click(submitButton, { detail: 1 });

    await waitFor(() => {
      expect(onRequest).toHaveBeenCalledWith({
        email: "mario@example.com",
        username: "marietto",
        password: VALID_PASSWORD,
        acceptPrivacyTermsOfService: true,
        acceptCurrentTermsOfService: true,
      });
    });

    expect(
      await screen.findByText(
        "Registrazione completata. Controlla la tua email per confermare l'indirizzo."
      )
    ).toBeInTheDocument();
  });

  it("mostra un bottone per reinviare l'email di conferma dopo il successo (T-047)", async () => {
    const onRequest = vi.fn().mockResolvedValue({ success: true, message: [] });
    const onResend = vi.fn().mockResolvedValue({ success: true, message: [] });

    render(
      <FormRegistration
        goBack={vi.fn()}
        onRequest={onRequest}
        onResend={onResend}
      />
    );

    fillMandatoryFields();

    const submitButton = await waitFor(
      () => screen.getByRole("button", { name: /CONFERMA/ }),
      { timeout: DEBOUNCE_TIMEOUT }
    );
    fireEvent.click(submitButton, { detail: 1 });

    await screen.findByText(/Controlla la tua email/);

    fireEvent.click(screen.getByText("Invia di nuovo l'email di conferma"), {
      detail: 1,
    });

    await waitFor(() =>
      expect(onResend).toHaveBeenCalledWith({ username: "mario@example.com" })
    );
    expect(
      await screen.findByText("Email inviata di nuovo.")
    ).toBeInTheDocument();
  });

  it("mostra l'errore quando la registrazione fallisce", async () => {
    const onRequest = vi.fn().mockResolvedValue({
      success: false,
      message: ["Nome utente già in uso"],
    });

    render(<FormRegistration goBack={vi.fn()} onRequest={onRequest} />);

    fillMandatoryFields();

    const submitButton = await waitFor(
      () => screen.getByRole("button", { name: /CONFERMA/ }),
      { timeout: DEBOUNCE_TIMEOUT }
    );
    fireEvent.click(submitButton, { detail: 1 });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nome utente già in uso"
    );
  });
});
