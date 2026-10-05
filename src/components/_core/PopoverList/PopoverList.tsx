import List from "../List";
import Popover, { IPopover } from "../Popover";
import Text from "../Text";
import PopoverListItem, { IPopoverListItem } from "./PopoverListItem";

export interface IPopoverList extends IPopover {
  actions?: IPopoverListItem[];
  title?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

const PopoverList = ({
  actions = [],
  title,
  header,
  footer,
  className,
  style,
  open,
  onClose,
  anchorEl,
  anchorReference = "anchorEl",
  originAnchor,
  originTransf,
  anchorPosition,
  positionZone,
}: IPopoverList) => (
  <Popover
    open={open && (!!actions.length || !!header)}
    style={style}
    className={className}
    onClose={onClose}
    anchorEl={anchorEl}
    anchorReference={anchorReference}
    originAnchor={originAnchor}
    originTransf={originTransf}
    anchorPosition={anchorPosition}
    positionZone={positionZone}
  >
    {header}
    <List style={{ maxHeight: "40vh" }}>
      {!title ? null : (
        <Text
          ellipsis
          weight="bolder"
          children={title}
          style={{ padding: "5px 15px" }}
        />
      )}
      {actions.map((cur: IPopoverListItem) => (
        <PopoverListItem key={cur.id} {...cur} onClose={onClose} />
      ))}
    </List>
    {footer}
  </Popover>
);

export default PopoverList;
