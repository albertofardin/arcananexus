"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  PayPalButtons,
  PayPalCardFieldsForm,
  PayPalCardFieldsProvider,
  PayPalScriptProvider,
  usePayPalCardFields,
} from "@paypal/react-paypal-js";
import Card from "@/components/_core/Card";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";
import CircularProgress from "@/components/_core/CircularProgress";
import { useToast } from "@/components/_core/Toast";
import { MEMBERSHIP_FEE } from "@/lib/constants";
import { paypalErrorMessage } from "@/lib/paypal-errors";

// Il Client ID è pubblico per natura (identifica l'app, non autentica).
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

// Stessi stili degli input, dentro gli iframe dei campi carta.
const cardFieldStyle = { input: { "font-size": "16px" } };

const priceLabel = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
}).format(MEMBERSHIP_FEE);

const CardSubmit = ({
  label,
  capturing,
}: {
  label: string;
  capturing: boolean;
}) => {
  const { cardFieldsForm } = usePayPalCardFields();
  const [submitting, setSubmitting] = React.useState(false);
  const loading = submitting || capturing;
  return (
    <div className="flex items-center gap-3">
      <Btn
        variant="bold"
        icon="credit_card"
        label={label}
        disabled={loading}
        onClick={async () => {
          setSubmitting(true);
          try {
            await cardFieldsForm?.submit();
          } catch {
            // L'errore arriva a `onError` del provider.
          }
          setSubmitting(false);
        }}
      />
      {loading && <CircularProgress size={20} />}
    </div>
  );
};

/**
 * Pagamento della tessera associativa annuale (quota fissa, 10€) con PayPal
 * o carta (3D Secure). A differenza di `EventRegisterForm` non c'è scelta di
 * personaggio né di quota: mirror semplificato dello stesso flusso PayPal.
 */
const MembershipPaymentForm = () => {
  const router = useRouter();
  const { showToast } = useToast();
  const [cardCapturing, setCardCapturing] = React.useState(false);

  const post = async (url: string, body: object) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      // Stato cambiato nel frattempo (es. tessera già pagata): ricarica la pagina.
      if (response.status === 409 || response.status === 422) router.refresh();
      throw new Error(json?.error ?? "Errore durante il pagamento");
    }
    return json;
  };

  const fail = (error: unknown) =>
    showToast({
      variant: "error",
      message:
        error instanceof Error && error.message
          ? error.message
          : "Errore di rete, riprova",
    });

  // L'SDK PayPal riporta qui il testo grezzo della risposta API (JSON con
  // debug_id, field, ecc.): non presentabile all'utente, solo in console.
  const failPayPal = (error: unknown) => {
    console.error("Errore PayPal:", error);
    showToast({ variant: "error", message: paypalErrorMessage(error) });
  };

  const createOrder = (method: "paypal" | "card") => async () =>
    (await post("/api/memberships/register", { method })).orderId as string;

  const capture = async (orderId: string) => {
    try {
      await post("/api/memberships/paypal/capture", { orderId });
      showToast({
        variant: "success",
        message: "Tessera associativa attivata",
      });
      router.refresh();
    } catch (error) {
      fail(error);
    }
  };

  return (
    <Card className="flex-col items-stretch gap-4 p-4">
      <Text
        size={3}
        weight="bolder"
        children={`Quota associativa di tesseramento: ${priceLabel}`}
      />
      <PayPalScriptProvider
        options={{
          clientId: PAYPAL_CLIENT_ID,
          currency: "EUR",
          intent: "capture",
          locale: "it_IT",
          components: "buttons,card-fields",
        }}
      >
        <PayPalButtons
          style={{ layout: "vertical" }}
          createOrder={createOrder("paypal")}
          onApprove={data => capture(data.orderID)}
          onError={failPayPal}
        />
        <PayPalCardFieldsProvider
          style={cardFieldStyle}
          createOrder={createOrder("card")}
          onApprove={data => {
            setCardCapturing(true);
            capture(data.orderID).finally(() => setCardCapturing(false));
          }}
          onError={failPayPal}
        >
          <PayPalCardFieldsForm />
          <CardSubmit
            label={`Paga ${priceLabel} con carta`}
            capturing={cardCapturing}
          />
        </PayPalCardFieldsProvider>
      </PayPalScriptProvider>
    </Card>
  );
};

export default MembershipPaymentForm;
