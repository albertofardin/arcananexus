import type {
  CatalogReferenceDataItem,
  SelectionEvaluation,
} from "./CharacterCreation";
import Card from "@/components/_core/Card";
import Text from "@/components/_core/Text";
import Divider from "@/components/_core/Divider";
import HeroSection from "@/components/HeroSection";

const CharacterCreationWarnings = ({
  isMaster,
  fieldErrors,
  selectionWarnings,
}: {
  isMaster: boolean;
  fieldErrors: string[];
  selectionWarnings: {
    item: CatalogReferenceDataItem;
    evaluation: SelectionEvaluation;
  }[];
}) => {
  const hasFieldErrors = fieldErrors.length > 0;
  const hasSelectionWarnings = selectionWarnings.length > 0;

  return (
    <Card className="flex-col items-start gap-3 p-3">
      <HeroSection
        color="#f00"
        icon="warning"
        title={
          hasFieldErrors
            ? "Campi obbligatori mancanti"
            : "Requisiti non soddisfatti"
        }
        subtitle={
          hasFieldErrors
            ? "Completa i campi evidenziati per creare il personaggio"
            : isMaster
              ? "Come master puoi comunque forzare la creazione"
              : "Rimuovi le voci in conflitto o aggiungi i requisiti mancanti"
        }
      />
      <div className="flex flex-col gap-2 p-2">
        {fieldErrors.map(message => (
          <Text key={message} size={0} className="text-fail">
            {message}
          </Text>
        ))}
        {hasFieldErrors && hasSelectionWarnings && <Divider />}
        {selectionWarnings.map(({ item, evaluation }) => (
          <div key={item.id} className="flex flex-col gap-1">
            <Text weight="bolder">{item.name}</Text>
            {evaluation.missingRequires.length > 0 && (
              <Text size={0} className="text-muted-fg">
                Richiede:{" "}
                {evaluation.missingRequires.map(r => r.name).join(", ")}
              </Text>
            )}
            {evaluation.missingRequirementGroups.map((group, index) => (
              <Text key={index} size={0} className="text-muted-fg">
                Richiede almeno una tra:{" "}
                {group.map(r => r.name).join(" oppure ")}
              </Text>
            ))}
            {evaluation.blockingConflicts.length > 0 && (
              <Text size={0} className="text-muted-fg">
                In conflitto con:{" "}
                {evaluation.blockingConflicts.map(r => r.name).join(", ")}
              </Text>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
};

export default CharacterCreationWarnings;
