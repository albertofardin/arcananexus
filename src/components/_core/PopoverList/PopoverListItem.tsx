import * as React from "react";
import ListItem, { IListItem } from "../ListItem";
import Divider from "../Divider";

export interface IPopoverListItem extends IListItem {
  divider?: boolean;
  hidden?: boolean;
  disableClose?: boolean;
  onClose?: (event: React.MouseEvent) => void;
}

const PopoverListItem = (p: IPopoverListItem) => {
  const { onClose, onClick, label, disableClose, hidden, divider } = p;

  const cbOnClick = React.useCallback(
    (id: string, event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!!onClick) onClick(id, event);
      if (!disableClose) onClose(event);
    },
    [disableClose, onClick, onClose]
  );

  return (
    <>
      {divider ? <Divider style={{ margin: "0 10px" }} /> : null}
      {hidden ? null : <ListItem {...p} label={label} onClick={cbOnClick} />}
    </>
  );
};

export default PopoverListItem;
