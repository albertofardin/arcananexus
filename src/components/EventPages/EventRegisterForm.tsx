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
import FieldSelect from "@/components/_core/FieldSelect";
import FieldText from "@/components/_core/FieldText";
import CircularProgress from "@/components/_core/CircularProgress/CircularProgress";
import { useToast } from "@/components/_core/Toast";
import { paypalErrorMessage } from "@/lib/paypal-errors";
import { routes } from "@/app/routes";

export interface IEventRegisterForm {
  eventId: number;
  campaignSlug?: string | null;
  /** Personaggi attivi selezionabili (solo eventi di campagna). */
  characters: { id: number; name: string; avatar: string | null }[];
  price: number;
  /** Saldo buoni dell'utente, scalato dalla quota prima del pagamento. */
  voucherBalance?: number;
  /** Quote alternative opzionali, tra cui l'utente sceglie al posto di `price`. */
  paymentOptions?: { id: number; label: string; amount: number }[];
}

const BASE_PRICE_ID = "base";

// Il Client ID è pubblico per natura (identifica l'app, non autentica).
const PAYPAL_CLIENT_ID = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

// Stessi stili degli input, dentro gli iframe dei campi carta.
const cardFieldStyle = { input: { "font-size": "16px" } };

const CardSubmit = ({
  label,
  disabled,
}: {
  label: string;
  disabled: boolean;
}) => {
  const { cardFieldsForm } = usePayPalCardFields();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center gap-3">
      <Btn
        variant="bold"
        icon="credit_card"
        label={label}
        disabled={disabled || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await cardFieldsForm?.submit();
          } catch {
            // L'errore arriva a `onError` del provider.
          }
          setBusy(false);
        }}
      />
      {busy && <CircularProgress size={20} />}
    </div>
  );
};

/** Scelta del personaggio (se più di uno) e iscrizione: gratuita, oppure pagamento con PayPal / Paga in 3 rate / carta (3D Secure). */
const EventRegisterForm = ({
  eventId,
  campaignSlug,
  characters,
  price,
  voucherBalance = 0,
  paymentOptions = [],
}: IEventRegisterForm) => {
  const router = useRouter();
  const { showToast } = useToast();
  const [characterId, setCharacterId] = React.useState<number | undefined>(
    characters.length === 1 ? characters[0].id : undefined
  );
  const [note, setNote] = React.useState("");
  const [paymentOptionId, setPaymentOptionId] = React.useState<
    number | typeof BASE_PRICE_ID
  >(BASE_PRICE_ID);
  const [busy, setBusy] = React.useState(false);

  const needsChoice = characters.length > 0;
  const selectedOption =
    paymentOptionId === BASE_PRICE_ID
      ? null
      : (paymentOptions.find(option => option.id === paymentOptionId) ?? null);
  const amount = selectedOption?.amount ?? price;
  const formatEuro = (value: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
    }).format(value);
  // Stessa regola del server (`voucherCoverage`): i buoni coprono al più la quota.
  const voucherAmount = Math.max(0, Math.min(amount, voucherBalance));
  const toPay = Math.round((amount - voucherAmount) * 100) / 100;
  const priceLabel = formatEuro(toPay);

  const post = async (url: string, body: object) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await response.json().catch(() => null);
    if (!response.ok) {
      // Stato cambiato nel frattempo (es. già iscritto): ricarica la pagina.
      if (response.status === 409 || response.status === 422) router.refresh();
      throw new Error(json?.error ?? "Errore durante l'iscrizione");
    }
    return json;
  };

  const done = () => {
    router.push(
      `${routes.event(campaignSlug, eventId)}?iscrizione=ok` as never
    );
    router.refresh();
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
    (
      await post(`/api/events/${eventId}/register`, {
        characterId: characterId ?? null,
        method,
        paymentOptionId: selectedOption?.id ?? null,
        note: note.trim() || null,
      })
    ).orderId as string;

  const capture = async (orderId: string) => {
    try {
      await post(`/api/events/${eventId}/paypal/capture`, {
        orderId,
        characterId: characterId ?? null,
        paymentOptionId: selectedOption?.id ?? null,
        note: note.trim() || null,
      });
      done();
    } catch (error) {
      fail(error);
    }
  };

  const registerFree = async () => {
    setBusy(true);
    try {
      await post(`/api/events/${eventId}/register`, {
        characterId: characterId ?? null,
        paymentOptionId: selectedOption?.id ?? null,
        note: note.trim() || null,
      });
      done();
      return; // busy resta attivo durante la navigazione
    } catch (error) {
      fail(error);
    }
    setBusy(false);
  };

  const notReady = needsChoice && characterId === undefined;

  return (
    <Card className="flex-col items-stretch gap-4 p-4">
      {needsChoice && characters.length > 1 && (
        <FieldSelect
          label="Personaggio da iscrivere"
          labelMandatory
          placeholder="Seleziona il personaggio"
          items={characters.map(character => ({
            id: character.id,
            label: character.name,
            avatar: character.avatar ?? undefined,
            avatarText: character.name,
            avatarShape: "square",
          }))}
          value={characterId}
          onChange={value => setCharacterId(value as number)}
        />
      )}
      {characters.length === 1 && (
        <Text children={`Personaggio: ${characters[0].name}`} weight="bolder" />
      )}
      <FieldText
        label="Note per lo staff (opzionale)"
        placeholder="Richieste di cartellini, noleggio armi o altro..."
        multiline
        value={note}
        onChange={setNote}
      />
      {paymentOptions.length > 0 && (
        <FieldSelect
          label="Quota di iscrizione"
          labelMandatory
          items={[
            { id: BASE_PRICE_ID, label: `Quota intera – ${formatEuro(price)}` },
            ...paymentOptions.map(option => ({
              id: option.id,
              label: `${option.label} – ${formatEuro(option.amount)}`,
            })),
          ]}
          value={paymentOptionId}
          onChange={value =>
            setPaymentOptionId(
              value === BASE_PRICE_ID ? BASE_PRICE_ID : (value as number)
            )
          }
        />
      )}
      <Text
        size={3}
        weight="bolder"
        children={
          amount > 0 ? `Quota: ${formatEuro(amount)}` : "Iscrizione gratuita"
        }
      />
      {voucherAmount > 0 && (
        <>
          <Text
            children={`Saldo buoni utilizzato: −${formatEuro(voucherAmount)}`}
          />
          <Text
            size={3}
            weight="bolder"
            children={`Da pagare: ${priceLabel}`}
          />
        </>
      )}
      {toPay > 0 ? (
        <PayPalScriptProvider
          options={{
            clientId: PAYPAL_CLIENT_ID,
            currency: "EUR",
            intent: "capture",
            locale: "it_IT",
            components: "buttons,card-fields",
            // Paga in 3 rate: compare da solo tra i pulsanti se l'ordine è idoneo.
            enableFunding: "paylater",
          }}
        >
          <PayPalButtons
            style={{ layout: "vertical" }}
            disabled={notReady}
            createOrder={createOrder("paypal")}
            onApprove={data => capture(data.orderID)}
            onError={failPayPal}
          />
          <PayPalCardFieldsProvider
            style={cardFieldStyle}
            createOrder={createOrder("card")}
            onApprove={data => capture(data.orderID)}
            onError={failPayPal}
          >
            <PayPalCardFieldsForm />
            <CardSubmit
              label={`Paga ${priceLabel} con carta`}
              disabled={notReady}
            />
          </PayPalCardFieldsProvider>
        </PayPalScriptProvider>
      ) : (
        <Btn
          variant="bold"
          icon={voucherAmount > 0 ? "gift_card" : "person_add"}
          label={voucherAmount > 0 ? "Iscriviti con i buoni" : "Iscriviti"}
          disabled={busy || notReady}
          onClick={registerFree}
        />
      )}
    </Card>
  );
};

export default EventRegisterForm;
