import Link from "next/link";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import HeroPage from "@/components/HeroPage";
import { routes } from "@/app/routes";
import Divider from "@/components/_core/Divider";
import Avatar from "@/components/_core/Avatar";

function AdminSectionRow({
  href,
  icon,
  title,
  subtitle,
}: {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
}) {
  return (
    <>
      <Link
        href={href as never}
        className="flex w-full items-center gap-3 p-2 text-left rounded hover:bg-accent"
      >
        <Avatar icon={icon} className="bg-bg" />
        <div className="min-w-0 flex-1">
          <Text size={2} weight="bolder" ellipsis children={title} />
          <Text className="text-muted-fg" ellipsis children={subtitle} />
        </div>
        <Icon className="text-muted-fg shrink-0" children="chevron_right" />
      </Link>
      <Divider className="last:hidden mx-2" />
    </>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ campaignSlug: string }>;
}) {
  const { campaignSlug } = await params;

  return (
    <>
      <HeroPage
        title="Gestione Campagna"
        subtitle="Staff, personaggi e configurazione della campagna"
      />
      <Card className="flex flex-col items-stretch justify-start p-2 overflow-y-auto">
        <AdminSectionRow
          href={routes.campaignAdminProgress(campaignSlug)}
          icon="tower"
          title="Progressione Campagna"
          subtitle="Evento, missive, downtime ed esperienza"
        />
        <AdminSectionRow
          href={routes.campaignAdminPresentation(campaignSlug)}
          icon="camera"
          title="Presentazione"
          subtitle="Nome, logo, copertina, colore, trama, descrizione e galleria"
        />
        <AdminSectionRow
          href={routes.campaignAdminRoles(campaignSlug)}
          icon="theater_mask"
          title="Gestione Staff"
          subtitle="Ruoli e permessi dello staff della campagna"
        />
        <AdminSectionRow
          href={routes.campaignAdminCharacters(campaignSlug)}
          icon="groups"
          title="Gestione Personaggi"
          subtitle="I personaggi PG e PNG della campagna"
        />
        <AdminSectionRow
          href={routes.campaignAdminReport(campaignSlug)}
          icon="assignment"
          title="Report Personaggi"
          subtitle="Statistiche e distribuzione dei personaggi della campagna"
        />
        <AdminSectionRow
          href={routes.campaignAdminPrint(campaignSlug)}
          icon="print"
          title="Area Stampa"
          subtitle="Schede personaggio, cartellini e pagine da stampare"
        />
        <AdminSectionRow
          href={routes.campaignAdminDataTypes(campaignSlug)}
          icon="category"
          title="Tipi di Dato"
          subtitle="Composizione dei dati di campagna e del pannello laterale"
        />
        <AdminSectionRow
          href={routes.campaignAdminFeatures(campaignSlug)}
          icon="interests"
          title="Feature"
          subtitle="Attivazione e configurazione delle feature della campagna"
        />
      </Card>
    </>
  );
}
