// Client minimale per le PayPal Orders API v2 (Advanced Checkout): il server
// crea l'ordine, il browser lo approva con l'SDK JS (pulsanti PayPal / Paga in
// 3 rate o campi carta con 3D Secure) e il server lo cattura. Nessun SDK lato
// server: bastano due chiamate fetch.
// Env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_ENV ("sandbox" default | "live").

const baseUrl = () =>
  process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

export const isPayPalConfigured = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

async function getAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString("base64");
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error("PayPal: autenticazione fallita");
  return (await response.json()).access_token;
}

export interface PayPalOrderInput {
  amount: string; // es. "12.50"
  description: string;
  // Max 127 caratteri: solo per la riconciliazione nella dashboard PayPal.
  customId: string;
  // "card": campi carta, con 3D Secure quando richiesto (PSD2).
  method: "paypal" | "card";
}

export async function createPayPalOrder(input: PayPalOrderInput) {
  const token = await getAccessToken();
  const response = await fetch(`${baseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: "EUR", value: input.amount },
        },
      ],
      ...(input.method === "card" && {
        payment_source: {
          card: {
            attributes: { verification: { method: "SCA_WHEN_REQUIRED" } },
          },
        },
      }),
    }),
  });
  if (!response.ok) throw new Error("PayPal: creazione ordine fallita");
  return { id: (await response.json()).id as string };
}

export interface CapturedPayPalOrder {
  status: string;
  amount: string | null;
  raw: unknown;
}

export async function capturePayPalOrder(
  orderId: string
): Promise<CapturedPayPalOrder> {
  const token = await getAccessToken();
  const response = await fetch(
    `${baseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    }
  );
  if (!response.ok) throw new Error("PayPal: cattura fallita");
  const order = await response.json();
  const unit = order.purchase_units?.[0];
  const capture = unit?.payments?.captures?.[0];
  return {
    // COMPLETED solo se la cattura è andata a buon fine (non "PENDING").
    status: capture?.status ?? order.status,
    amount: capture?.amount?.value ?? null,
    raw: order,
  };
}
