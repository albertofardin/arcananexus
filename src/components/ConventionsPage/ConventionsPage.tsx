import Image from "next/image";
import { conventions, type Convention } from "./conventions";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";
import HeroPage from "@/components/HeroPage";
import Badge from "@/components/_core/Badge";

function ConventionCard({ convention }: { convention: Convention }) {
  const { name, logo, discount, code, paragraphs, links } = convention;

  return (
    <Card className="flex flex-col items-center gap-3 p-4 text-center sm:flex-row sm:items-stretch sm:p-2 sm:text-left">
      {/* ── logo ── */}
      <Image
        src={logo}
        alt={name}
        width={144}
        height={144}
        className="h-24 w-24 flex-shrink-0 rounded object-contain sm:h-36 sm:w-36"
      />

      {/* ── contenuto ── */}
      <div className="flex min-w-0 flex-1 flex-col items-center gap-3 sm:items-stretch">
        {/* nome + sconto */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
          <Text size={4} weight="bolder" children={name} />
          {discount && (
            <Badge color="var(--primary)" label={`Sconto ${discount}`} />
          )}
        </div>

        {/* descrizione */}
        <div className="flex flex-col gap-2">
          {paragraphs.map((p, i) => (
            <Text key={i} className="text-muted-fg" children={p} />
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2 pt-1 sm:justify-start">
          {links.map(link => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 transition-colors hover:border-primary hover:bg-primary/5"
            >
              <Icon size="sm" className="text-primary" children={link.icon} />
              <Text children={link.label} />
            </a>
          ))}
          {code && (
            <div className="flex w-fit items-center gap-2 rounded border border-dashed border-border bg-muted-bg/30 px-3 py-2">
              <Icon size="sm" className="text-muted-fg" children="sell" />
              <Text className="text-muted-fg" children="Codice" />
              <Text
                size={2}
                weight="bolder"
                className="font-mono tracking-wide"
                children={code}
              />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function ConventionsPage() {
  return (
    <>
      <HeroPage
        title="Convenzioni"
        subtitle="Sconti e vantaggi riservati ai soci di Arcana Domine presso i nostri partner"
      />

      <div className="grid grid-cols-1 gap-3 pb-10 xl:grid-cols-2">
        {conventions.map(convention => (
          <ConventionCard key={convention.name} convention={convention} />
        ))}
      </div>
    </>
  );
}
