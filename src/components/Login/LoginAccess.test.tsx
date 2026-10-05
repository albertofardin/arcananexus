import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import LoginAccess from "./LoginAccess";

const click1 = (el: HTMLElement) => fireEvent.click(el, { detail: 1 });

const requestPasswordReset = vi.fn();
const resetPassword = vi.fn();
const sendVerificationEmail = vi.fn();

vi.mock("@/lib/auth-client", () => ({
  authClient: { $store: { notify: vi.fn() } },
  requestPasswordReset: (...args: unknown[]) => requestPasswordReset(...args),
  resetPassword: (...args: unknown[]) => resetPassword(...args),
  sendVerificationEmail: (...args: unknown[]) => sendVerificationEmail(...args),
}));

const setSearch = (search: string) => {
  window.history.pushState({}, "", `/${search}`);
};

const VALID_PASSWORD = "Password1";

// `Login` tiene sempre montati tutti i suoi form (visibilità via CSS
// transform, non conditional rendering — vedi `Zoom`/`Slide` in `Login.tsx`),
// quindi il campo password di `FormLogin` è anche lui presente col
// placeholder "******". Scopiamo la query al `<form>` di `FormForgotPassword`
// tramite il suo titolo per non prenderlo per sbaglio.
const getForgotPasswordForm = async (): Promise<HTMLElement> => {
  const title = await screen.findByText("Password Dimenticata");
  return title.closest("form") as HTMLElement;
};

describe("LoginAccess — recupero password (T-046)", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
    vi.clearAllMocks();
  });

  it("chiede il reset dal link 'password dimenticata' e mostra sempre il messaggio di successo generico (niente enumerazione utenti)", async () => {
    requestPasswordReset.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    render(<LoginAccess open onClose={vi.fn()} />);

    click1(screen.getByText(/password dimenticata\?/i));

    const emailInput = await screen.findByPlaceholderText("email@dominio.com");
    fireEvent.change(emailInput, { target: { value: "chiunque@example.com" } });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(screen.getByRole("button", { name: /^reimposta$/i }));

    await waitFor(() =>
      expect(requestPasswordReset).toHaveBeenCalledWith({
        email: "chiunque@example.com",
        redirectTo: "/?resetPassword=1",
      })
    );
    expect(
      await screen.findByText(
        "Ti abbiamo inviato un'email con un link per reimpostare la tua password"
      )
    ).toBeInTheDocument();
  });

  it("mappa gli errori noti di richiesta reset in italiano (mai il messaggio inglese di Better Auth)", async () => {
    requestPasswordReset.mockResolvedValue({
      data: null,
      error: { code: "TOO_MANY_REQUESTS", message: "Too many requests" },
    });
    render(<LoginAccess open onClose={vi.fn()} />);

    click1(screen.getByText(/password dimenticata\?/i));

    const emailInput = await screen.findByPlaceholderText("email@dominio.com");
    fireEvent.change(emailInput, { target: { value: "chiunque@example.com" } });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(screen.getByRole("button", { name: /^reimposta$/i }));

    expect(
      await screen.findByText("Troppi tentativi, riprova tra qualche minuto.")
    ).toBeInTheDocument();
    expect(screen.queryByText("Too many requests")).not.toBeInTheDocument();
  });

  it("imposta la nuova password chiamando resetPassword con { newPassword, token } dal link email", async () => {
    setSearch("?resetPassword=1&token=tok-abc");
    resetPassword.mockResolvedValue({ data: { status: true }, error: null });
    render(<LoginAccess open onClose={vi.fn()} />);

    const form = await getForgotPasswordForm();
    const [pwdInput, confirmInput] =
      within(form).getAllByPlaceholderText("******");
    fireEvent.change(pwdInput, { target: { value: VALID_PASSWORD } });
    await new Promise(resolve => setTimeout(resolve, 600));
    fireEvent.change(confirmInput, { target: { value: VALID_PASSWORD } });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(within(form).getByRole("button", { name: /^conferma$/i }));

    await waitFor(() =>
      expect(resetPassword).toHaveBeenCalledWith({
        newPassword: VALID_PASSWORD,
        token: "tok-abc",
      })
    );
    expect(
      await screen.findByText("Password aggiornata con successo!")
    ).toBeInTheDocument();
  });

  it("mostra un messaggio in italiano per un token scaduto/già usato, senza crash", async () => {
    setSearch("?resetPassword=1&token=tok-expired");
    resetPassword.mockResolvedValue({
      data: null,
      error: { code: "INVALID_TOKEN", message: "Invalid token" },
    });
    render(<LoginAccess open onClose={vi.fn()} />);

    const form = await getForgotPasswordForm();
    const [pwdInput, confirmInput] =
      within(form).getAllByPlaceholderText("******");
    fireEvent.change(pwdInput, { target: { value: VALID_PASSWORD } });
    await new Promise(resolve => setTimeout(resolve, 600));
    fireEvent.change(confirmInput, { target: { value: VALID_PASSWORD } });
    await new Promise(resolve => setTimeout(resolve, 600));

    click1(within(form).getByRole("button", { name: /^conferma$/i }));

    expect(
      await screen.findByText(
        /link per reimpostare la password non è valido o è scaduto/i
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Invalid token")).not.toBeInTheDocument();
  });
});

describe("LoginAccess — verifica email in registrazione (T-047)", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("mostra un messaggio distinto (italiano) quando il login è bloccato da email non verificata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: "Email not verified",
          details: "EMAIL_NOT_VERIFIED",
        }),
      })
    );
    const onClose = vi.fn();
    render(<LoginAccess open onClose={onClose} />);

    const usernameInput = screen.getByPlaceholderText(
      "email@dominio.com oppure nome utente"
    );
    const loginForm = usernameInput.closest("form") as HTMLElement;
    fireEvent.change(usernameInput, {
      target: { value: "utente@example.com" },
    });
    await new Promise(resolve => setTimeout(resolve, 600));
    const passwordInput = within(loginForm).getByPlaceholderText("******");
    fireEvent.change(passwordInput, { target: { value: "Password1" } });
    await new Promise(resolve => setTimeout(resolve, 600));

    const submitBtn = await waitFor(
      () => within(loginForm).getByRole("button", { name: /^accedi$/i }),
      { timeout: 2000 }
    );
    click1(submitBtn);

    expect(
      await screen.findByText(/email non verificata/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Email not verified")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("dopo la registrazione, se il server non apre una sessione (utente non verificato), non naviga in dashboard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          token: null,
          user: { email: "nuovo@example.com" },
        }),
      })
    );
    const onClose = vi.fn();
    render(<LoginAccess open onClose={onClose} />);

    click1(screen.getByText(/non hai ancora un account\?/i));

    const registrationTitle = await screen.findByText("Registrati");
    const form = registrationTitle.closest("form") as HTMLElement;
    fireEvent.change(within(form).getByPlaceholderText("email@dominio.com"), {
      target: { value: "nuovo@example.com" },
    });
    await new Promise(resolve => setTimeout(resolve, 600));
    fireEvent.change(
      within(form).getByPlaceholderText("username per accedere (non nome PG)"),
      { target: { value: "nuovoutente" } }
    );
    await new Promise(resolve => setTimeout(resolve, 600));
    const [pwd, confirm] = within(form).getAllByPlaceholderText("******");
    fireEvent.change(pwd, { target: { value: "Password1" } });
    await new Promise(resolve => setTimeout(resolve, 600));
    fireEvent.change(confirm, { target: { value: "Password1" } });
    await new Promise(resolve => setTimeout(resolve, 600));
    click1(
      within(form).getByText(
        "Dichiaro di aver letto ed aderire alla Privacy Policy"
      )
    );
    click1(
      within(form).getByText(
        "Dichiaro di dare il mio consenso al trattamento dei dati personali fornitovi"
      )
    );

    const submitBtn = await waitFor(
      () => within(form).getByRole("button", { name: /^conferma$/i }),
      { timeout: 2000 }
    );
    click1(submitBtn);

    expect(
      await screen.findByText(/Controlla la tua email/)
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
