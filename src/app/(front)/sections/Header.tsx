import HeaderNav from "./HeaderNav";
import { prisma } from "@/lib/db";
import { listPublicCampaigns } from "@/lib/repositories/campaign.repository";
import { ARCANA_DOMINE_SLUG } from "@/lib/constants";

/**
 * Server Component: recupera le campagne visibili per la tendina "Campagne"
 * dell'header (`HeaderNav`, client) — così le pagine che montano `<Header />`
 * non devono occuparsene singolarmente.
 */
const Header = async () => {
  const campaigns = await listPublicCampaigns(prisma, ARCANA_DOMINE_SLUG);
  return <HeaderNav campaigns={campaigns} />;
};

export default Header;
