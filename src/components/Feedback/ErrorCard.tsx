"use client";

import Card from "../_core/Card";
import Text from "../_core/Text";
import Icon from "../_core/Icon";
import Btn from "../_core/Btn";

export interface IErrorCard {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

/** Card di errore con bottone "Riprova" */
const ErrorCard = ({
  title = "Errore nel caricamento",
  message = "Si è verificato un errore, riprova tra qualche istante",
  retryLabel = "Riprova",
  onRetry,
}: IErrorCard) => (
  <Card className="flex-col items-center gap-3 border-fail/50 bg-fail/5 px-6 py-10">
    <Icon size="lg" className="text-fail" children="error" />
    <Text size={3} weight="bolder" className="text-fail" children={title} />
    <Text className="text-muted-fg text-center" children={message} />
    {onRetry && (
      <Btn variant="bold" label={retryLabel} icon="refresh" onClick={onRetry} />
    )}
  </Card>
);

export default ErrorCard;
