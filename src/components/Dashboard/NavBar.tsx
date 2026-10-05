"use client";
import * as React from "react";
import { useRouter, usePathname, useParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useQueryCampaigns } from "@/lib/queries/campaigns";
import { useQueryMyCharacters } from "@/lib/queries/campaignCharacters";
import { getCharacterStatus } from "@/components/BadgeCharacterStatus";
import { FT_MISSIVE, FT_DOWNTIME } from "@/lib/features/featuresName";
import Icon from "@/components/_core/Icon";
import BtnBase from "@/components/_core/BtnBase";
import AvatarUser from "@/components/AvatarUser";
import BadgeCount from "@/components/BadgeCount";
import PopoverList, { IPopoverListItem } from "@/components/_core/PopoverList";
import { useNotifications } from "@/lib/queries/notifications";
import { cn } from "@/lib/utils";
import { routes } from "@/app/routes";

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const itemClassName = (active?: boolean) =>
  cn(
    "flex flex-1 items-center justify-center rounded p-2",
    "disabled:pointer-events-none disabled:opacity-30 border border-transparent hover:border-primary",
    active && "bg-[color-mix(in_srgb,var(--primary)_10%,var(--button-bg))]"
  );

const BottomNavItem = ({
  icon,
  active,
  disabled,
  onClick,
}: {
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) => (
  <BtnBase
    color="var(--primary)"
    onClick={onClick}
    disabled={disabled}
    className={itemClassName(active)}
  >
    <Icon
      style={active ? { color: "var(--primary)" } : {}}
      size="lg"
      children={icon}
    />
  </BtnBase>
);

/** Pulsante menu con lo stesso badge rosso di notifiche non lette di
 * `BtnNotifications` (stessa query, nessun fetch aggiuntivo). */
const MenuItem = ({ onClick }: { onClick: () => void }) => {
  const { data } = useNotifications();

  return (
    <BtnBase
      color="var(--primary)"
      onClick={onClick}
      className={itemClassName()}
    >
      <Icon size="lg" children="menu" />
      <BadgeCount count={data?.unreadCount ?? 0} className="top-0.5 right-1" />
    </BtnBase>
  );
};

const BottomNavAvatarItem = ({
  label,
  active,
  onClick,
  src,
  text,
  circle,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  src?: string | null;
  text?: string;
  circle?: boolean;
}) => (
  <BtnBase
    color="var(--primary)"
    onClick={onClick}
    tooltip={label}
    className={itemClassName(active)}
  >
    <AvatarUser
      size={30}
      src={src ?? undefined}
      text={text}
      circle={circle}
      className={cn("border", active && "border-[var(--primary)]")}
    />
  </BtnBase>
);

/** 3° pulsante in campagna: tendina Missive/Downtime, o link diretto se una
 * sola delle due feature è attiva, o placeholder disabilitato se nessuna. */
const MissiveDowntimeItem = ({
  campaignSlug,
  hasMissive,
  hasDowntime,
  active,
}: {
  campaignSlug: string;
  hasMissive: boolean;
  hasDowntime: boolean;
  active: boolean;
}) => {
  const router = useRouter();
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);

  if (hasMissive && !hasDowntime) {
    return (
      <BottomNavItem
        icon="mail"
        active={active}
        onClick={() =>
          router.push(routes.campaignMissive(campaignSlug) as never)
        }
      />
    );
  }
  if (hasDowntime && !hasMissive) {
    return (
      <BottomNavItem
        icon="downtime"
        active={active}
        onClick={() =>
          router.push(routes.campaignDowntime(campaignSlug) as never)
        }
      />
    );
  }
  if (!hasMissive && !hasDowntime) {
    return <BottomNavItem icon="assignment" disabled />;
  }

  const actions: IPopoverListItem[] = [
    {
      id: "missive",
      label: "Missive",
      icon: "mail",
      onClick: () => router.push(routes.campaignMissive(campaignSlug) as never),
    },
    {
      id: "downtime",
      label: "Downtime",
      icon: "downtime",
      onClick: () =>
        router.push(routes.campaignDowntime(campaignSlug) as never),
    },
  ];

  return (
    <div ref={anchorRef} className="flex flex-1">
      <BottomNavItem
        icon="assignment"
        active={active}
        onClick={() => setOpen(true)}
      />
      <PopoverList
        open={open}
        onClose={() => setOpen(false)}
        anchorEl={anchorRef.current}
        actions={actions}
        originAnchor={{
          vertical: "top",
          horizontal: "center",
        }}
        originTransf={{
          vertical: "bottom",
          horizontal: "center",
        }}
      />
    </div>
  );
};

/** 4° pulsante in campagna: avatar quadrato del PG del giocatore, o icona
 * "people" con lista flottante se ha più personaggi (PG e/o PNG), o tendina
 * "Crea nuovo PG" se non ne ha. Mostra solo i personaggi attivi (approvati,
 * né morti né parcheggiati). */
const CharactersItem = ({
  campaignSlug,
  active,
}: {
  campaignSlug: string;
  active: boolean;
}) => {
  const router = useRouter();
  const anchorRef = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  const { data: allCharacters = [] } = useQueryMyCharacters(campaignSlug);
  const characters = allCharacters.filter(
    character => getCharacterStatus(character) === "approved"
  );

  if (characters.length === 1) {
    const [character] = characters;
    return (
      <BottomNavAvatarItem
        label={character.name}
        active={active}
        src={character.avatar}
        text={character.name}
        onClick={() =>
          router.push(
            routes.campaignCharacter(campaignSlug, character.id) as never
          )
        }
      />
    );
  }

  const actions: IPopoverListItem[] =
    characters.length === 0
      ? [
          {
            id: "new",
            label: "Crea nuovo PG",
            icon: "person_add",
            onClick: () =>
              router.push(routes.campaignCharacterNew(campaignSlug) as never),
          },
        ]
      : characters.map(character => ({
          id: character.id,
          label: character.name,
          subLabel: character.type === "png" ? "PNG" : "PG",
          avatar: character.avatar ?? undefined,
          avatarText: character.name,
          onClick: () =>
            router.push(
              routes.campaignCharacter(campaignSlug, character.id) as never
            ),
        }));

  return (
    <div ref={anchorRef} className="flex flex-1">
      <BottomNavItem
        icon="people"
        active={active}
        onClick={() => setOpen(true)}
      />
      <PopoverList
        open={open}
        onClose={() => setOpen(false)}
        anchorEl={anchorRef.current}
        actions={actions}
      />
    </div>
  );
};

const NavBar = ({ onOpenMenu }: { onOpenMenu: () => void }) => {
  const pathname = usePathname();
  const router = useRouter();
  const params = useParams<{ campaignSlug?: string }>();
  const campaignSlug = params.campaignSlug ?? undefined;

  const { data: session } = useSession();
  const { data: camps = [] } = useQueryCampaigns();
  const slcCamp = camps.find(cam => cam.slug === campaignSlug);

  const path = safeDecode(pathname);
  const isActive = (href: string) => path === safeDecode(href);
  const isActivePrefix = (href: string) => path.startsWith(safeDecode(href));

  // I pulsanti navigano con router.push (niente <Link>), quindi senza questo
  // nessuna destinazione viene precaricata e ogni tap aspetta un round-trip
  // completo prima di mostrare anche solo il loading.tsx.
  const slug = slcCamp?.slug;
  React.useEffect(() => {
    const hrefs = slug
      ? [
          routes.campaign(slug),
          routes.campaignEvents(slug),
          routes.campaignMissive(slug),
          routes.campaignDowntime(slug),
          routes.campaignCharacters(slug),
        ]
      : [
          routes.home(),
          routes.profileConventions(),
          routes.events(),
          routes.profile(),
        ];
    hrefs.forEach(href => router.prefetch(href as never));
  }, [slug, router]);

  if (!slcCamp) {
    return (
      <nav className="grid grid-flow-col auto-cols-fr shrink-0 border-t border-border bg-card p-1 gap-1">
        <MenuItem onClick={onOpenMenu} />
        <BottomNavItem
          icon="article"
          active={isActive(routes.home())}
          onClick={() => router.push(routes.home() as never)}
        />
        <BottomNavItem
          icon="chat_favourite"
          active={isActive(routes.profileConventions())}
          onClick={() => router.push(routes.profileConventions() as never)}
        />
        <BottomNavItem
          icon="event"
          active={isActive(routes.events())}
          onClick={() => router.push(routes.events() as never)}
        />
        <BottomNavAvatarItem
          label="Profilo"
          circle
          active={isActive(routes.profile())}
          src={session?.user?.image}
          text={session?.user?.name}
          onClick={() => router.push(routes.profile() as never)}
        />
      </nav>
    );
  }

  return (
    <nav className="grid grid-flow-col auto-cols-fr shrink-0 border-t border-border bg-card p-1 gap-1">
      <MenuItem onClick={onOpenMenu} />
      <BottomNavItem
        icon="article"
        active={isActive(routes.campaign(slcCamp.slug))}
        onClick={() => router.push(routes.campaign(slcCamp.slug) as never)}
      />
      <MissiveDowntimeItem
        campaignSlug={slcCamp.slug}
        hasMissive={slcCamp.activeFeatures.includes(FT_MISSIVE)}
        hasDowntime={slcCamp.activeFeatures.includes(FT_DOWNTIME)}
        active={
          isActivePrefix(routes.campaignMissive(slcCamp.slug)) ||
          isActivePrefix(routes.campaignDowntime(slcCamp.slug))
        }
      />
      <BottomNavItem
        icon="event"
        active={isActivePrefix(routes.campaignEvents(slcCamp.slug))}
        onClick={() =>
          router.push(routes.campaignEvents(slcCamp.slug) as never)
        }
      />
      <CharactersItem
        campaignSlug={slcCamp.slug}
        active={isActivePrefix(routes.campaignCharacters(slcCamp.slug))}
      />
    </nav>
  );
};

export default NavBar;
