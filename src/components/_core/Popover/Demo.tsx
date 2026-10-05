import * as React from "react";
import BtnBase from "../BtnBase";
import Card from "../Card";
import Icon from "../Icon";
import Text from "../Text";
import InputBoolean from "../../_stories/InputBoolean";
import Popover, { getPopoverStyle } from "./";

const anchorReference = "anchorEl";
const COLOR_THEME = "#007bff";

interface IBtn {
  keepValue;
  currValue;
  onClick: (v) => void;
}
const Btn = ({ keepValue, currValue, onClick }: IBtn) => {
  const selected = keepValue === currValue;
  const cbClick = React.useCallback(() => {
    onClick(keepValue);
  }, [keepValue, onClick]);
  const color = selected ? COLOR_THEME : "#ccc";
  return (
    <BtnBase
      style={{
        display: "flex",
        margin: "0px 5px",
        alignSelf: "stretch",
        padding: 5,
      }}
      onClick={cbClick}
    >
      <Icon
        style={{ color }}
        children={selected ? "radio_button_checked" : "radio_button_unchecked"}
      />
      <Text style={{ color, marginLeft: 10 }} size={2} children={keepValue} />
    </BtnBase>
  );
};

interface ICardButton {
  origin: "originTransf" | "originAnchor";
  anchorH;
  setAnchorH;
  anchorV;
  setAnchorV;
  transfH;
  setTransfH;
  transfV;
  setTransfV;
}
const CardButton = ({
  origin,
  anchorH,
  setAnchorH,
  anchorV,
  setAnchorV,
  transfH,
  setTransfH,
  transfV,
  setTransfV,
}: ICardButton) => {
  const isTransf = origin === "originTransf";
  const h = isTransf ? transfH : anchorH;
  const setH = isTransf ? setTransfH : setAnchorH;
  const v = isTransf ? transfV : anchorV;
  const setV = isTransf ? setTransfV : setAnchorV;
  return (
    <>
      <Text style={{ margin: "10px 0" }} size={5} children={origin} />
      <Card style={{ padding: 10, marginBottom: 10, display: "flex" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "start",
          }}
        >
          <Text size={3} style={{ margin: "5px 10px" }} children="horizontal" />
          <Btn currValue={h} keepValue="left" onClick={setH} />
          <Btn currValue={h} keepValue="center" onClick={setH} />
          <Btn currValue={h} keepValue="right" onClick={setH} />
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "start",
          }}
        >
          <Text size={3} style={{ margin: "5px 10px" }} children="vertical" />
          <Btn currValue={v} keepValue="top" onClick={setV} />
          <Btn currValue={v} keepValue="center" onClick={setV} />
          <Btn currValue={v} keepValue="bottom" onClick={setV} />
        </div>
      </Card>
    </>
  );
};

const Demo = () => {
  const [btnRef, setBtnRef] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const onOpen = React.useCallback(() => setOpen(true), []);
  const onClose = React.useCallback(() => setOpen(false), []);
  const [backdropVisible, setBackdropVisible] = React.useState(true);

  const [anchorH, setAnchorH] = React.useState(
    "center" as "left" | "right" | "center"
  );
  const [anchorV, setAnchorV] = React.useState(
    "center" as "bottom" | "top" | "center"
  );
  const [transfH, setTransfH] = React.useState(
    "left" as "left" | "right" | "center"
  );
  const [transfV, setTransfV] = React.useState(
    "top" as "bottom" | "top" | "center"
  );

  return (
    <div
      style={{
        height: "inherit",
        width: "inherit",
        display: "flex",
        flexDirection: "row",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <BtnBase
          style={{
            padding: "15px 25px",
            border: `1px solid ${COLOR_THEME}`,
          }}
          ref={setBtnRef}
          onClick={onOpen}
          children="CLICK ME"
        />
        <div
          style={{
            width: 0,
            height: 0,
            position: "absolute",
            outline: `5px solid rgb(14, 169, 17)`,
            ...getPopoverStyle({
              anchorEl: btnRef,
              anchorReference,
              originAnchor: {
                horizontal: anchorH,
                vertical: anchorV,
              },
              originTransf: {
                horizontal: transfH,
                vertical: transfV,
              },
            }),
          }}
        />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <CardButton
          origin="originAnchor"
          anchorH={anchorH}
          setAnchorH={setAnchorH}
          anchorV={anchorV}
          setAnchorV={setAnchorV}
          transfH={transfH}
          setTransfH={setTransfH}
          transfV={transfV}
          setTransfV={setTransfV}
        />
        <CardButton
          origin="originTransf"
          anchorH={anchorH}
          setAnchorH={setAnchorH}
          anchorV={anchorV}
          setAnchorV={setAnchorV}
          transfH={transfH}
          setTransfH={setTransfH}
          transfV={transfV}
          setTransfV={setTransfV}
        />
        <InputBoolean
          onChange={setBackdropVisible}
          value={backdropVisible}
          label="backdropVisible"
        />
        <textarea
          style={{
            flex: 1,
            outline: 0,
            border: 0,
            resize: "none",
            backgroundColor: "#f1f1f1",
          }}
          value={JSON.stringify(
            {
              //anchorReference,
              originAnchor: {
                horizontal: anchorH,
                vertical: anchorV,
              },
              originTransf: {
                horizontal: transfH,
                vertical: transfV,
              },
            },
            null,
            "\t"
          )}
          readOnly
        />
      </div>
      <Popover
        open={open}
        onClose={onClose}
        anchorEl={btnRef}
        anchorReference={anchorReference}
        originAnchor={{
          horizontal: anchorH,
          vertical: anchorV,
        }}
        originTransf={{
          horizontal: transfH,
          vertical: transfV,
        }}
        backdropVisible={backdropVisible}
      >
        <div style={{ padding: 20 }}> The content of the Popover</div>
        <div style={{ padding: 20 }}> The content of the Popover</div>
        <div style={{ padding: 20 }}> The content of the Popover</div>
        <div style={{ padding: 20 }}> The content of the Popover</div>
        <div style={{ padding: 20 }}> The content of the Popover</div>
        <div style={{ padding: 20 }}> The content of the Popover</div>
      </Popover>
    </div>
  );
};
export default Demo;
