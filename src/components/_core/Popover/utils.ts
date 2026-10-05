// LINK https://github.com/mui/material-ui/blob/v4.12.3/packages/material-ui/src/Popover/Popover.js

export interface PopoverOrigin {
  horizontal: "auto" | "left" | "right" | "center";
  vertical: "auto" | "bottom" | "top" | "center";
}

interface IGetPositionZone {
  innerHeight: number;
  innerWidth: number;
  anchorTop: number;
  anchorLeft: number;
}
export function getPositionZone({
  innerHeight,
  innerWidth,
  anchorTop,
  anchorLeft,
}: IGetPositionZone): 1 | 2 | 3 | 4 {
  if (anchorTop <= innerHeight / 2) {
    return anchorLeft <= innerWidth / 2 ? 1 : 2;
  } else {
    return anchorLeft <= innerWidth / 2 ? 3 : 4;
  }
}

function getPositionAuto(anchorEl): 1 | 2 | 3 | 4 {
  const rect = anchorEl.getBoundingClientRect();
  const { width, height, top, left } = rect;
  const anchorTop = top + height;
  const anchorLeft = left + width;
  const { innerHeight, innerWidth } = ownerWindow(resolveAnchorEl(anchorEl));
  return getPositionZone({
    innerHeight,
    innerWidth,
    anchorTop,
    anchorLeft,
  });
}

function getOffsetTop(rect, vertical, positionAuto: 1 | 2 | 3 | 4) {
  let offset = 0;
  if (typeof vertical === "number") {
    offset = vertical;
  } else if (vertical === "center") {
    offset = rect.height / 2;
  } else if (vertical === "bottom") {
    offset = rect.height;
  } else if (vertical === "auto") {
    switch (positionAuto) {
      case 1:
        offset = rect.height;
        break;
      case 2:
        offset = rect.height;
        break;
      case 3:
        offset = 0;
        break;
      case 4:
        offset = 0;
        break;
    }
  }
  return offset;
}
function getOffsetLeft(rect, horizontal, positionAuto: 1 | 2 | 3 | 4) {
  let offset = 0;
  if (typeof horizontal === "number") {
    offset = horizontal;
  } else if (horizontal === "center") {
    offset = rect.width / 2;
  } else if (horizontal === "right") {
    offset = rect.width;
  } else if (horizontal === "auto") {
    switch (positionAuto) {
      case 1:
        offset = 0;
        break;
      case 2:
        offset = rect.width;
        break;
      case 3:
        offset = 0;
        break;
      case 4:
        offset = rect.width;
        break;
    }
  }
  return offset;
}
function resolveAnchorEl(anchorEl) {
  return typeof anchorEl === "function" ? anchorEl() : anchorEl;
}
function ownerDocument(node: Node | null | undefined): Document {
  return (node && node.ownerDocument) || document;
}
function ownerWindow(node: Node | undefined): Window {
  const doc = ownerDocument(node);
  return doc.defaultView || window;
}
function getCoords(
  originAnchor: PopoverOrigin,
  positionAuto: 1 | 2 | 3 | 4,
  anchorEl
): { top: number; left: number } {
  const rect = anchorEl.getBoundingClientRect();
  return {
    top: Math.round(
      rect.top + getOffsetTop(rect, originAnchor.vertical, positionAuto)
    ),
    left: Math.round(
      rect.left + getOffsetLeft(rect, originAnchor.horizontal, positionAuto)
    ),
  };
}
function getTransf(
  originTransf: PopoverOrigin,
  positionAuto?: 1 | 2 | 3 | 4
): { transform: string } {
  let transX = 0;
  let transY = 0;
  if (originTransf.horizontal === "right") transX = -100;
  if (originTransf.horizontal === "center") transX = -50;
  if (originTransf.horizontal === "auto" && !!positionAuto) {
    switch (positionAuto) {
      case 1:
        transX = 0;
        break;
      case 2:
        transX = -100;
        break;
      case 3:
        transX = 0;
        break;
      case 4:
        transX = -100;
        break;
    }
  }
  if (originTransf.vertical === "bottom") transY = -100;
  if (originTransf.vertical === "center") transY = -50;
  if (originTransf.vertical === "auto" && !!positionAuto) {
    switch (positionAuto) {
      case 1:
        transY = 0;
        break;
      case 2:
        transY = 0;
        break;
      case 3:
        transY = -100;
        break;
      case 4:
        transY = -100;
        break;
    }
  }
  return {
    transform: `translate(${transX}%,${transY}%)`,
  };
}

interface IGetPopoverStyle {
  style?: React.CSSProperties;
  anchorReference?: "anchorEl" | "anchorPosition";
  anchorPosition?: { top: number; left: number };
  anchorEl?;
  originAnchor?: PopoverOrigin;
  originTransf?: PopoverOrigin;
  positionZone?: 1 | 2 | 3 | 4;
}
export const getPopoverStyle = ({
  style,
  anchorReference,
  anchorPosition,
  anchorEl,
  originAnchor,
  originTransf,
  positionZone,
}: IGetPopoverStyle): React.CSSProperties => {
  if (!anchorEl || anchorReference === "anchorPosition") {
    return {
      ...style,
      ...anchorPosition,
      ...getTransf(originTransf, positionZone),
      animation: "none",
    };
  }
  const positionAuto = getPositionAuto(anchorEl);
  return {
    ...style,
    ...getCoords(originAnchor, positionAuto, anchorEl),
    ...getTransf(originTransf, positionAuto),
    animation: "none",
    boxSizing: "border-box",
  };
};
