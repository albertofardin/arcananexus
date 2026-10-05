import * as React from "react";
import FieldRichText from "./FieldRichText";

export default {
  title: "core/FieldRichText",
  component: FieldRichText,
};
const VALUE = `
  <h2>Elara Nightshade</h2>
  <p>
    <strong>Elara</strong> è una <em>maga</em> dell'<span style="color: #9333ea">Ordine Cremisi</span>,
    temuta e rispettata in egual misura nelle sale del Concilio. Ha giurato fedeltà
    alla Torre solo dopo aver perso tutto il resto. 🔥
  </p>

  <img src="https://placehold.co/560x200" alt="Ritratto di Elara Nightshade" />

  <h2>Tratti principali</h2>
  <ul>
    <li>Alleata storica dei <span style="color: #0d9488">Guardiani del Bosco</span></li>
    <li>Teme il fuoco più di ogni altra cosa, nonostante la sua magia</li>
    <li>Porta sempre con sé un pugnale rituale appartenuto alla madre</li>
    <li>Non si fida di chi porta lo stemma dei <span style="color: #dc2626">Corvi di Sangue</span></li>
  </ul>

  <blockquote>
    <p>"Chi entra nell'Ordine non ne esce, se non in cenere." — Motto del Concilio Cremisi</p>
  </blockquote>

  <hr>

  <h2>Comandi di gioco</h2>
  <p>Per richiedere un downtime di ricerca arcana, usa il comando:</p>
  <pre><code>/downtime richiedi Elara Nightshade --tipo=ricerca</code></pre>

  <p>
    Per i dettagli completi sul funzionamento dei downtime, consulta la
    <a href="https://tiptap.dev" target="_blank" rel="noopener noreferrer nofollow">documentazione del master</a>.
  </p>

  <h2>Note per il master</h2>
  <p>
    Elara ha un debito irrisolto con la gilda dei mercanti: qualunque scena che
    coinvolga <strong>denaro</strong> o <em>favori</em> dovrebbe tenerne conto. 👀
  </p>
  <ol>
    <li>Aggiornare la scheda dopo ogni evento con nuovi contatti</li>
    <li>Verificare il possesso dell'amuleto prima delle scene di combattimento</li>
    <li>Segnalare eventuali richieste di downtime non evase entro 48h</li>
  </ol>
`;

const OutputPreview = ({ html }: { html: string }) => (
  <div style={{ marginTop: 12 }}>
    <p
      style={{
        margin: "0 0 4px",
        fontSize: 11,
        fontWeight: 400,
        opacity: 0.6,
        textTransform: "uppercase",
      }}
    >
      Value (stringa HTML)
    </p>
    <pre
      style={{
        margin: 0,
        padding: 10,
        fontSize: 12,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        background: "var(--muted-bg)",
        color: "var(--muted-fg)",
        borderRadius: 6,
        maxHeight: 160,
        overflow: "auto",
      }}
    >
      {html || "(vuoto)"}
    </pre>
  </div>
);

const PlaygroundStory = ({
  value,
  readOnly,
}: {
  value: string;
  readOnly?: boolean;
}) => {
  const [v, setV] = React.useState(value);

  return (
    <div
      style={{
        padding: 25,
        height: "inherit",
        width: "inherit",
        overflow: "scroll",
      }}
    >
      <FieldRichText value={v} onChange={setV} disabled={readOnly} />
      <OutputPreview html={v} />
    </div>
  );
};
export const Demo = PlaygroundStory.bind({});
export const Example = PlaygroundStory.bind({});
Example.args = { value: VALUE };
export const ReadOnly = PlaygroundStory.bind({});
ReadOnly.args = { value: VALUE, readOnly: true };
