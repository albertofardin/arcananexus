"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import ModalUserDetail from "./ModalUserDetail";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Btn from "@/components/_core/Btn";
import Icon from "@/components/_core/Icon";
import AvatarUser from "@/components/AvatarUser";
import Divider from "@/components/_core/Divider";
import FieldText from "@/components/_core/FieldText";
import FieldSelect from "@/components/_core/FieldSelect";
import Skeleton from "@/components/_core/Skeleton";
import { useToast } from "@/components/_core/Toast";
import { ErrorCard } from "@/components/Feedback";
import HeroPage from "@/components/HeroPage";
import { useSession } from "@/lib/auth-client";
import {
  useQueryAdminUsers,
  ADMIN_USERS_PAGE_SIZE,
} from "@/lib/queries/adminUsers";
import { useCapabilities } from "@/lib/queries/capabilities";
import { startImpersonation } from "@/lib/queries/impersonation";
import { routes } from "@/app/routes";
import type { AdminUser } from "@/lib/validations/user";
import Badge from "@/components/_core/Badge";

/** Pillola di stato tesseramento, verde se rinnovata nell'anno corrente. */
export const MembershipBadge = ({
  renewed,
  year,
}: {
  renewed: boolean;
  year: number;
}) => (
  <Badge
    color={renewed ? "var(--succ)" : "var(--fail)"}
    icon={renewed ? "verified" : "warning"}
    label={renewed ? `Tesserato ${year}` : "Tessera non rinnovata"}
  />
);

/** Icona di stato email, verde/spuntata se confermata. */
export const EmailVerifiedIcon = ({ verified }: { verified: boolean }) => (
  <Icon
    size="sm"
    className={verified ? "text-succ" : "text-fail"}
    title={verified ? "Email confermata" : "Email non confermata"}
    children={verified ? "check_circle" : "cancel"}
  />
);

/** Valore del filtro anno quando non si vuole filtrare per tesseramento. */
const ALL_YEARS = "all";

const UsersManager = () => {
  const currentYear = new Date().getFullYear();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { data: session } = useSession();
  const { data: capabilities } = useCapabilities();
  const [search, setSearch] = React.useState("");
  const [yearFilter, setYearFilter] = React.useState<string | number>(
    ALL_YEARS
  );
  const [selected, setSelected] = React.useState<AdminUser | null>(null);
  const [page, setPage] = React.useState(0);
  const [impersonatingId, setImpersonatingId] = React.useState<string | null>(
    null
  );

  const { data, isPending, error, refetch } = useQueryAdminUsers({
    search: search.trim() || undefined,
    year: yearFilter === ALL_YEARS ? undefined : Number(yearFilter),
    page: page + 1,
    pageSize: ADMIN_USERS_PAGE_SIZE,
  });

  // Azione "Impersona": solo Sviluppo Web la vede, mai sulla propria riga
  // (il backend rifiuta comunque self-impersonation e utenti non-sviluppo, ma
  // qui evitiamo di mostrare un'azione che finirebbe in un 400/403).
  const isSviluppo = capabilities?.isSviluppo ?? false;
  const currentUserId = session?.user?.id;
  const canImpersonate = React.useCallback(
    (user: AdminUser) =>
      isSviluppo && !!currentUserId && user.id !== currentUserId,
    [isSviluppo, currentUserId]
  );

  const handleImpersonate = React.useCallback(
    async (user: AdminUser) => {
      setImpersonatingId(user.id);
      try {
        await startImpersonation(user.id);
        // La sessione attiva ora è quella dell'utente impersonato: la cache
        // react-query resta legata all'identità precedente (capabilities,
        // elenco utenti, ...), va svuotata prima di ripartire dalla home.
        // router.refresh() è necessario perché il push da solo non rigenera
        // gli RSC già in Router Cache: senza, la home potrebbe essere servita
        // ancora con l'identità admin sotto il banner di impersonation.
        queryClient.clear();
        router.push(routes.home() as never);
        router.refresh();
      } catch (err) {
        console.error(err);
        showToast({
          variant: "error",
          message: "Impossibile avviare l'impersonazione. Riprova.",
        });
      } finally {
        setImpersonatingId(null);
      }
    },
    [queryClient, router, showToast]
  );

  // Riporta alla prima pagina quando i filtri cambiano il set di risultati.
  React.useEffect(() => {
    setPage(0);
  }, [search, yearFilter]);

  const isRenewed = React.useCallback(
    (u: AdminUser) => u.membershipYears.includes(currentYear),
    [currentYear]
  );

  const yearItems = React.useMemo(
    () => [
      { id: ALL_YEARS, label: "Tutti gli anni", icon: "groups" },
      ...(data?.availableYears ?? []).map(y => ({
        id: y,
        label: `Tesserati ${y}`,
        icon: "card_membership",
      })),
    ],
    [data?.availableYears]
  );

  const users = data?.users ?? [];
  const total = data?.pagination.total ?? 0;
  const pageCount = data?.pagination.totalPages ?? 1;

  return (
    <>
      <HeroPage
        title="Utenti"
        subtitle="Elenco degli utenti registrati e stato del tesseramento"
      />

      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        <div className="flex flex-wrap items-center gap-2 p-2">
          <div className="min-w-[220px] flex-1">
            <FieldText
              icon="search"
              placeholder="Cerca per nome o email..."
              value={search}
              onChange={setSearch}
            />
          </div>
          <div className="min-w-[200px]">
            <FieldSelect
              icon="card_membership"
              value={yearFilter}
              items={yearItems}
              onChange={value => setYearFilter(value as string | number)}
            />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Icon className="text-muted-fg" children="groups" />
            <Text weight="bolder" children={total} />
            <Text
              className="text-muted-fg"
              children={total === 1 ? "utente" : "utenti"}
            />
          </div>
        </div>
        <Divider />
        <div className="flex flex-col p-2">
          {isPending ? (
            <>
              <Skeleton className="h-[66px] w-full mb-1" />
              <Skeleton className="h-[66px] w-full mb-1" />
              <Skeleton className="h-[66px] w-full mb-1" />
            </>
          ) : error ? (
            <ErrorCard onRetry={() => refetch()} />
          ) : users.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-16">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted-bg">
                <Icon size="lg" className="text-muted-fg" children="search" />
              </div>
              <Text size={2} weight="bolder" children="Nessun utente trovato" />
              <Text
                className="text-muted-fg text-center"
                children={
                  yearFilter !== ALL_YEARS
                    ? "Prova a selezionare «Tutti gli anni» o ad affinare la ricerca."
                    : "Affina la ricerca per nome o email."
                }
              />
            </div>
          ) : (
            users.map(user => {
              const renewed = isRenewed(user);
              return (
                <React.Fragment key={user.id}>
                  <div className="flex items-center justify-between gap-4 pr-3 rounded hover:bg-accent">
                    <button
                      type="button"
                      onClick={() => setSelected(user)}
                      className="flex w-full items-center gap-2 px-3 py-2"
                    >
                      <AvatarUser
                        circle
                        src={user.image ?? undefined}
                        text={user.name}
                      />
                      <div className="min-w-0 flex-1 text-left">
                        <Text
                          size={2}
                          weight="bolder"
                          ellipsis
                          children={user.name}
                        />
                        <div className="flex items-center gap-1">
                          <EmailVerifiedIcon verified={user.emailVerified} />
                          <Text
                            className="text-muted-fg"
                            ellipsis
                            children={user.email}
                          />
                        </div>
                      </div>
                      <MembershipBadge renewed={renewed} year={currentYear} />
                      <Icon
                        className="text-muted-fg"
                        children="chevron_right"
                      />
                    </button>
                    {canImpersonate(user) && (
                      <Btn
                        variant="bold"
                        icon="settings"
                        tooltip="Impersona"
                        disabled={impersonatingId !== null}
                        onClick={() => handleImpersonate(user)}
                      />
                    )}
                  </div>
                  <Divider className="last:hidden mx-2" />
                </React.Fragment>
              );
            })
          )}
        </div>

        {/* Paginazione: server-side, ADMIN_USERS_PAGE_SIZE utenti per pagina */}
        {!isPending && !error && pageCount > 1 && (
          <>
            <Divider />
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              <Text
                className="text-muted-fg"
                children={`${page * ADMIN_USERS_PAGE_SIZE + 1}–${Math.min(
                  (page + 1) * ADMIN_USERS_PAGE_SIZE,
                  total
                )} di ${total}`}
              />
              <div className="flex items-center gap-2">
                <Btn
                  icon="chevron_left"
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                />
                <Text weight="bolder" children={`${page + 1} / ${pageCount}`} />
                <Btn
                  icon="chevron_right"
                  disabled={page >= pageCount - 1}
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                />
              </div>
            </div>
          </>
        )}

        <ModalUserDetail
          user={selected}
          onClose={() => setSelected(null)}
          currentYear={currentYear}
        />
      </Card>
    </>
  );
};

export default UsersManager;
