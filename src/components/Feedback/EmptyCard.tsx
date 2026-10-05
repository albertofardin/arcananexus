import * as React from "react";
import Card from "../_core/Card";
import Text from "../_core/Text";
import Icon from "../_core/Icon";
import { cn } from "@/lib/utils";

export interface IEmptyCard {
  icon: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

const EmptyCard = ({ icon, title, message, action, className }: IEmptyCard) => (
  <Card
    elevation={0}
    className={cn("flex-col flex-1 items-center gap-3 px-6 py-14", className)}
  >
    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted-bg">
      <Icon size="lg" className="text-muted-fg" children={icon} />
    </div>
    <div className="text-center">
      <Text size={3} weight="bolder" children={title} />
      {message && (
        <Text className="text-muted-fg text-center" children={message} />
      )}
    </div>
    {action}
  </Card>
);

export default EmptyCard;
