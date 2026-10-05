import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FormForgotPassword from "./FormForgotPassword";

// `Btn`/`BtnBase` distinguono singolo/doppio click da `event.detail` (vedi
// `BtnBase.tsx`): senza `detail: 1`, `fireEvent.click` non attiva l'handler.
const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

const setSearch = (search: string) => {
  window.history.pushState({}, "", `/${search}`);
};

const VALID_PASSWORD = "Password1";

// I due campi (`FormChoosePassword`) non hanno un `<label for>` reale (solo
// testo visivo, vedi `Field.tsx`): li distinguiamo per ordine nel DOM, stesso
// placeholder "******" per entrambi.
const typePasswords = async (
  pwd = VALID_PASSWORD,
  confirm = VALID_PASSWORD
) => {
  const [pwdInput, confirmInput] = screen.getAllByPlaceholderText("******");
  fireEvent.change(pwdInput, { target: { value: pwd } });
  await new Promise(resolve => setTimeout(resolve, 600));
  fireEvent.change(confirmInput, { target: { value: confirm } });
  await new Promise(resolve => setTimeout(resolve, 600));
};

describe("FormForgotPassword (T-046)", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("invia { token, password } letti dalla query string al submit", async () => {
    setSearch("?resetPassword=1&token=tok-abc");
    const onRequest = vi.fn().mockResolvedValue({ success: true, message: [] });
    render(<FormForgotPassword goBack={vi.fn()} onRequest={onRequest} />);

    await typePasswords();
    click1(screen.getByRole("button", { name: /^conferma$/i }));

    await waitFor(() =>
      expect(onRequest).toHaveBeenCalledWith({
        token: "tok-abc",
        password: VALID_PASSWORD,
      })
    );
    expect(
      await screen.findByText("Password aggiornata con successo!")
    ).toBeInTheDocument();
  });

  it("mostra un errore in italiano, senza crash, quando manca il token (link consumato/malformato)", async () => {
    setSearch("?resetPassword=1");
    const onRequest = vi.fn();
    render(<FormForgotPassword goBack={vi.fn()} onRequest={onRequest} />);

    expect(
      screen.getByText(/link per reimpostare la password non è valido/i)
    ).toBeInTheDocument();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("mostra un errore in italiano, senza crash, quando Better Auth ha già rifiutato il token (?error=INVALID_TOKEN)", async () => {
    setSearch("?resetPassword=1&error=INVALID_TOKEN");
    const onRequest = vi.fn();
    render(<FormForgotPassword goBack={vi.fn()} onRequest={onRequest} />);

    expect(
      screen.getByText(/link per reimpostare la password non è valido/i)
    ).toBeInTheDocument();
    expect(onRequest).not.toHaveBeenCalled();
  });

  it("mostra l'errore del server (es. token scaduto rifiutato solo al submit) in italiano", async () => {
    setSearch("?resetPassword=1&token=tok-expired");
    const onRequest = vi.fn().mockResolvedValue({
      success: false,
      message: [
        "Il link per reimpostare la password non è valido o è scaduto. Richiedine uno nuovo.",
      ],
    });
    render(<FormForgotPassword goBack={vi.fn()} onRequest={onRequest} />);

    await typePasswords();
    click1(screen.getByRole("button", { name: /^conferma$/i }));

    expect(
      await screen.findByText(/link per reimpostare la password non è valido/i)
    ).toBeInTheDocument();
  });
});
