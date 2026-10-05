import { notFound } from "next/navigation";
import { headers } from "next/headers";
import MembershipPaymentForm from "./MembershipPaymentForm";
import MembershipCard, {
  MembershipHistoryCard,
} from "@/components/MembershipCard";
import HeroPage from "@/components/HeroPage";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import Divider from "@/components/_core/Divider";
import BtnLink from "@/components/_core/BtnLink";
import formatCurrency from "@/lib/utils/formatCurrency";
import formatDate from "@/lib/utils/formatDate";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getCurrentAssociationYear } from "@/lib/authorization";
import { getUserMembershipsWithPayments } from "@/lib/repositories/membership.repository";
import { getVoucherBalance } from "@/lib/repositories/voucher.repository";
import { listUserPaidBookingsForYear } from "@/lib/repositories/booking.repository";
import { getPersonalDataByUserId } from "@/lib/repositories/personalData.repository";
import { isPersonalDataComplete } from "@/lib/validations/profile";
import type { MembershipWithStatus } from "@/lib/validations/membership";
import { routes } from "@/app/routes";

// Parte della quota pagata con il saldo buoni (salvata in `paymentData`).
const voucherPart = (paymentData: unknown) =>
  Number(
    (paymentData as { voucherAmount?: number } | null)?.voucherAmount ?? 0
  );

interface Requirement {
  ok: boolean;
  title: string;
  message: string;
  href?: string;
  cta?: string;
}

/**
 * Tesseramento e pagamenti (T-051): tessera dell'anno corrente (con il form
 * di pagamento se manca), storico tessere e pagamenti eventi dell'anno
 * corrente — nessuno può contestare un addebito che vede qui. Server
 * Component: nessun fetch client, mirror del pattern di `EventPages`.
 */
export default async function MembershipPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) notFound();
  const userId = session.user.id;
  const currentYear = getCurrentAssociationYear();

  const [membershipsResult, personalData, eventPayments, voucherBalance] =
    await Promise.all([
      getUserMembershipsWithPayments(prisma, userId),
      getPersonalDataByUserId(prisma, userId),
      listUserPaidBookingsForYear(prisma, userId, currentYear),
      getVoucherBalance(prisma, userId, currentYear),
    ]);
  if (!membershipsResult) notFound();
  const { user, memberships, paymentMap } = membershipsResult;

  const now = new Date();
  const enrichedMemberships: MembershipWithStatus[] = memberships.map(
    membership => {
      const payment = paymentMap.get(membership.paymentId);
      return {
        ...membership,
        payment: payment
          ? {
              id: payment.id,
              value: payment.value.toString(),
              createdAt: payment.createdAt,
              paymentData: payment.paymentData as Record<string, unknown>,
            }
          : null,
        status: now <= membership.endDate ? "active" : "expired",
      };
    }
  );

  const activeMembership = enrichedMemberships.find(
    m => m.year === currentYear
  );
  const pastMemberships = enrichedMemberships.filter(
    m => m.year !== currentYear
  );
  const hasCompletePersonalData = isPersonalDataComplete(personalData);

  const requirements: Requirement[] = [
    {
      ok: hasCompletePersonalData,
      title: "Anagrafica completa",
      message: hasCompletePersonalData
        ? "La tua anagrafica è completa."
        : "Completa tutti i campi della tua anagrafica (per i minorenni anche i dati del tutore).",
      href: routes.profile(),
      cta: "Completa l'anagrafica",
    },
  ];
  const hasMissingRequirements = requirements.some(r => !r.ok);

  return (
    <>
      <HeroPage
        title="Tesseramento e pagamenti"
        subtitle="La tua tessera, i pagamenti degli eventi e lo storico delle iscrizioni"
      />

      {voucherBalance > 0 && (
        <div
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{
            backgroundColor: "color-mix(in srgb, var(--info) 12%, var(--bg))",
            color: "color-mix(in srgb, #000000 15%, var(--info))",
          }}
        >
          <Icon className="mt-1 shrink-0 text-inherit" children="gift_card" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <Text
                weight="bolder"
                className="text-inherit"
                children="Saldo buoni"
              />
              <Text
                size={2}
                weight="bolder"
                className="text-inherit"
                children={formatCurrency(String(voucherBalance))}
              />
            </div>
            <Text
              className="text-inherit opacity-80"
              children={`Viene scalato automaticamente dalla quota delle tue iscrizioni agli eventi. Vale fino alla scadenza della tessera ${currentYear}: con il pagamento della nuova tessera annuale l'eventuale saldo residuo si azzera.`}
            />
          </div>
        </div>
      )}

      {activeMembership ? (
        <div className="flex flex-col gap-4">
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              backgroundColor: "color-mix(in srgb, var(--succ) 12%, var(--bg))",
              color: "color-mix(in srgb, #000000 15%, var(--succ))",
            }}
          >
            <Icon className="shrink-0 text-inherit" children="verified" />
            <Text
              weight="bolder"
              className="text-inherit"
              children={`Sei iscritto per l'anno ${currentYear}.`}
            />
          </div>
          <MembershipCard
            membership={activeMembership}
            holderName={user.name}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3"
            style={{
              backgroundColor: "color-mix(in srgb, var(--fail) 12%, var(--bg))",
              color: "color-mix(in srgb, #000000 15%, var(--fail))",
            }}
          >
            <Icon className="shrink-0 text-inherit" children="person_off" />
            <Text
              weight="bolder"
              className="text-inherit"
              children={`Non sei ancora iscritto per l'anno ${currentYear}.`}
            />
          </div>

          {hasMissingRequirements && (
            <Card className="flex-col items-stretch gap-3 p-4">
              <Text
                size={3}
                weight="bolder"
                children={`Tessera associativa ${currentYear}`}
              />
              {requirements.map(requirement => (
                <div
                  key={requirement.title}
                  className="flex flex-wrap items-center gap-3"
                >
                  <Icon
                    className={
                      requirement.ok ? "text-green-600" : "text-red-600"
                    }
                    children={requirement.ok ? "check_circle" : "cancel"}
                  />
                  <div className="min-w-0 flex-1">
                    <Text weight="bolder" children={requirement.title} />
                    <Text
                      className="text-muted-fg"
                      children={requirement.message}
                    />
                  </div>
                  {!requirement.ok && requirement.href && (
                    <BtnLink
                      selected
                      color="var(--warn)"
                      icon="warning"
                      label={requirement.cta ?? "Vai"}
                      href={requirement.href}
                    />
                  )}
                </div>
              ))}
            </Card>
          )}

          {hasCompletePersonalData && <MembershipPaymentForm />}
        </div>
      )}

      {pastMemberships.length > 0 && (
        <div className="mt-10">
          <div className="mb-4 flex items-center gap-3">
            <Icon className="text-muted-fg" children="history" />
            <Text size={3} weight="bolder" children="Storico Tessere" />
            <Divider className="flex-1" />
          </div>
          <div className="flex flex-col gap-3">
            {pastMemberships.map(membership => (
              <MembershipHistoryCard
                key={membership.id}
                membership={membership}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-10">
        <div className="mb-4 flex items-center gap-3">
          <Icon className="text-muted-fg" children="receipt_long" />
          <Text
            size={3}
            weight="bolder"
            children={`Pagamenti ${currentYear}`}
          />
          <Divider className="flex-1" />
        </div>
        {eventPayments.length === 0 && !activeMembership?.payment ? (
          <Card className="flex-col items-center gap-2 px-6 py-8">
            <Icon
              size="lg"
              className="text-muted-fg"
              children="credit_card_off"
            />
            <Text
              className="text-muted-fg text-center"
              children="Nessun pagamento registrato per quest'anno"
            />
          </Card>
        ) : (
          <Card className="flex-col items-stretch divide-y divide-border p-0">
            {[
              ...(activeMembership?.payment
                ? [
                    {
                      key: "membership",
                      date: activeMembership.payment.createdAt,
                      title: `Tessera ${activeMembership.year}`,
                      note: null,
                      amount: formatCurrency(activeMembership.payment.value),
                    },
                  ]
                : []),
              ...eventPayments.map(booking => {
                const fromVouchers = voucherPart(booking.payment?.paymentData);
                return {
                  key: booking.id,
                  date: booking.payment?.createdAt ?? booking.bookingDate,
                  title: booking.event.campaign
                    ? `${booking.event.campaign.name}: ${booking.event.name}`
                    : booking.event.name,
                  note:
                    fromVouchers > 0
                      ? `di cui ${formatCurrency(String(fromVouchers))} con buoni`
                      : null,
                  amount: booking.payment
                    ? formatCurrency(booking.payment.value.toString())
                    : "—",
                };
              }),
            ]
              .sort((a, b) => b.date.getTime() - a.date.getTime())
              .map(row => (
                <div
                  key={row.key}
                  className="flex items-center gap-4 px-4 py-3"
                >
                  <Text
                    className="w-24 shrink-0 tabular-nums text-muted-fg"
                    children={formatDate(row.date)}
                  />
                  <div className="min-w-0 flex-1">
                    <Text weight="bolder" ellipsis children={row.title} />
                    {row.note && (
                      <Text className="text-muted-fg" children={row.note} />
                    )}
                  </div>
                  <Text
                    weight="bolder"
                    className="shrink-0 tabular-nums"
                    children={row.amount}
                  />
                </div>
              ))}
          </Card>
        )}
      </div>
    </>
  );
}
