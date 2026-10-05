"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CharacterType } from "@prisma/client";
import CharacterListRow from "./CharacterListRow";
import FilterCharacterStatus from "./FilterCharacterStatus";
import FilterCharacterType from "./FilterCharacterType";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import Btn from "@/components/_core/Btn";
import Divider from "@/components/_core/Divider";
import FieldText from "@/components/_core/FieldText";
import Skeleton from "@/components/_core/Skeleton";
import HeroPage from "@/components/HeroPage";
import { ErrorCard } from "@/components/Feedback";
import {
  getCharacterStatus,
  type CharacterStatus,
} from "@/components/BadgeCharacterStatus";
import { cn } from "@/lib/utils";
import { Character, characterSchema } from "@/lib/validations/character";
import { routes } from "@/app/routes";

const CHARACTER_STATUS_ORDER: Record<CharacterStatus, number> = {
  approved: 0,
  parked: 1,
  review: 2,
  dead: 3,
};

export interface ICharactersList {
  /** "owner": i soli personaggi del giocatore; "admin": tutti quelli della campagna, per lo staff. */
  variant: "owner" | "admin";
}

/** Elenco dei personaggi: dei propri (owner) o di tutta la campagna (admin, per lo staff). */
const CharactersList = ({ variant }: ICharactersList) => {
  const params = useParams<{ campaignSlug: string }>();
  const router = useRouter();
  const isAdmin = variant === "admin";

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    CharacterStatus | "all"
  >("approved");
  const [typeFilter, setTypeFilter] = React.useState<CharacterType | "all">(
    CharacterType.pg
  );

  const {
    data: characters,
    isLoading,
    error,
    refetch,
  } = useQuery<Character[]>({
    queryKey: isAdmin
      ? ["campaign-characters", params.campaignSlug]
      : ["characters", params.campaignSlug],
    queryFn: async () => {
      const url = isAdmin
        ? `/api/campaigns/${params.campaignSlug}/characters`
        : `/api/characters?campaignSlug=${params.campaignSlug}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch characters");
      }
      const data = await response.json();
      return data.map((char: unknown) => characterSchema.parse(char));
    },
    enabled: !!params.campaignSlug,
  });

  const handleCreate = React.useCallback(() => {
    router.push(routes.campaignCharacterNew(params.campaignSlug) as never);
  }, [router, params.campaignSlug]);

  const filtered = React.useMemo(() => {
    const list = characters ?? [];

    if (isAdmin) {
      const q = search.trim().toLowerCase();
      const result = list.filter(c => {
        if (statusFilter !== "all" && getCharacterStatus(c) !== statusFilter) {
          return false;
        }
        if (typeFilter !== "all" && c.type !== typeFilter) {
          return false;
        }
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.userName ?? "").toLowerCase().includes(q)
        );
      });
      return [...result].sort((a, b) => a.name.localeCompare(b.name));
    }

    // Prima gli attivi, poi in pausa, in revisione, infine i deceduti;
    // a parità, per data di creazione crescente.
    return [...list].sort((a, b) => {
      const statusDiff =
        CHARACTER_STATUS_ORDER[getCharacterStatus(a)] -
        CHARACTER_STATUS_ORDER[getCharacterStatus(b)];
      if (statusDiff !== 0) return statusDiff;
      return (
        new Date(a.creationDate).getTime() - new Date(b.creationDate).getTime()
      );
    });
  }, [characters, isAdmin, search, statusFilter, typeFilter]);

  return (
    <>
      <HeroPage
        title={isAdmin ? "Personaggi della campagna" : "I miei Personaggi"}
        subtitle={
          isAdmin
            ? "Elenco dei personaggi di tutti i giocatori della campagna"
            : "Crea e gestisci i personaggi della campagna"
        }
        action={
          <Btn
            variant="bold"
            icon="add"
            label="Crea personaggio"
            onClick={handleCreate}
          />
        }
      />

      <Card className="min-h-fit flex flex-col items-stretch justify-start p-0">
        {isAdmin && (
          <>
            <div className="flex flex-wrap items-center gap-2 p-2">
              <FieldText
                className="min-w-[220px] flex-1"
                icon="search"
                placeholder="Cerca per nome personaggio o giocatore..."
                value={search}
                onChange={setSearch}
              />
              <FilterCharacterType
                className="max-w-[180px]"
                value={typeFilter}
                onChange={setTypeFilter}
              />
              <FilterCharacterStatus
                className="max-w-[180px]"
                value={statusFilter}
                onChange={setStatusFilter}
              />
              <div className="ml-auto flex items-center gap-1.5 px-4">
                <Icon className="text-muted-fg" children="groups" />
                <Text weight="bolder" children={filtered.length} />
                <Text
                  className="text-muted-fg"
                  children={
                    filtered.length === 1 ? "personaggio" : "personaggi"
                  }
                />
              </div>
            </div>
            <Divider />
          </>
        )}

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            !isLoading && !error && filtered.length === 0
              ? "flex flex-col items-center gap-3 px-6 py-16"
              : "flex flex-col p-2"
          )}
        >
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded p-3">
                <Skeleton className="h-12 w-12 rounded" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="hidden h-6 w-32 rounded-full sm:block" />
              </div>
            ))
          ) : error ? (
            <ErrorCard onRetry={() => refetch()} />
          ) : filtered.length === 0 ? (
            <>
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted-bg">
                <Icon
                  size="lg"
                  className="text-muted-fg"
                  children={isAdmin ? "search" : "person_off"}
                />
              </div>
              <Text
                size={2}
                weight="bolder"
                children={
                  isAdmin
                    ? "Nessun personaggio trovato"
                    : "Nessun personaggio ancora creato"
                }
              />
              <Text
                className="text-muted-fg text-center"
                children={
                  isAdmin
                    ? "Affina la ricerca per nome personaggio o giocatore."
                    : "Crea il primo personaggio per iniziare."
                }
              />
              {!isAdmin && (
                <Btn
                  variant="bold"
                  icon="add"
                  label="Crea personaggio"
                  onClick={handleCreate}
                />
              )}
            </>
          ) : (
            filtered.map(character => (
              <CharacterListRow
                key={character.id}
                character={character}
                href={
                  isAdmin
                    ? routes.campaignAdminCharacter(
                        params.campaignSlug,
                        character.id
                      )
                    : routes.campaignCharacter(
                        params.campaignSlug,
                        character.id
                      )
                }
                showOwnerAvatar={isAdmin}
              />
            ))
          )}
        </div>
      </Card>
    </>
  );
};

export default CharactersList;
