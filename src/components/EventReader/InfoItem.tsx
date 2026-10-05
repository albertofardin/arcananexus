import Text from "@/components/_core/Text";
import Icon from "@/components/_core/Icon";

export interface IInfoItem {
  icon?: string;
  label: string;
  value: string;
}

/** Coppia etichetta/valore con icona, usata nelle pagine di dettaglio */
const InfoItem = ({ icon, label, value }: IInfoItem) => (
  <div className="flex items-center gap-3">
    {icon && (
      <div className="flex h-10 w-10 min-w-[40px] items-center justify-center rounded bg-primary/10">
        <Icon className="text-primary" children={icon} />
      </div>
    )}
    <div className="min-w-0">
      <Text className="text-muted-fg" children={label} />
      <Text size={2} weight="bolder" children={value} />
    </div>
  </div>
);

export default InfoItem;
