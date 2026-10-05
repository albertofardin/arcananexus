import * as React from "react";
import { fn } from "storybook/test";
import InputBoolean from "../../_stories/InputBoolean";
import CardDemo from "../../_stories/CardDemo";
import Btn from ".";

const urlImage = "./storybook/test_image1.jpeg";
const menuProps = {
  icon: true,
  iconClassName: "xxx",
  title: "Menu title",
  items: [
    {
      id: "1",
      label: "item_1",
      onClick: fn(),
    },
    {
      id: "2",
      label: "item_2",
      onClick: fn(),
    },
    {
      id: "3",
      label: "item_3",
      onClick: fn(),
    },
  ],
};

const BtnDemo = () => {
  const [menu, setMenu] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  const [selected, setSelected] = React.useState(false);
  const [avatar, setAvatar] = React.useState(false);
  const [tooltip, setTooltip] = React.useState(false);
  const [icon, setIcon] = React.useState(true);
  const [onClick, setOnclick] = React.useState(true);
  const [label, setLabel] = React.useState(true);
  const [labelRequired, setLabelRequired] = React.useState(false);
  const [labelPosition, setLabelPosition] = React.useState(false);
  const [variant, setVariant] = React.useState("bold" as "light" | "bold");
  const onChangeVariant = React.useCallback(() => {
    setVariant(variant === "light" ? "bold" : "light");
  }, [variant]);

  return (
    <div
      style={{
        height: "100%",
        overflow: "auto",
        display: "flex",
        alignItems: "stretch",
        flexDirection: "column",
        flex: 1,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          flexDirection: "row",
          flex: 1,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Btn
            color="#2857d8"
            onClick={!onClick ? undefined : fn()}
            icon={!icon ? undefined : "settings"}
            label={!label ? undefined : "Settings"}
            tooltip={!tooltip ? undefined : "settings"}
            selected={selected}
            disabled={disabled}
            menu={!menu ? undefined : menuProps}
            avatar={!avatar ? undefined : urlImage}
            labelPosition={labelPosition}
            labelRequired={labelRequired}
            variant={variant}
            style={{ margin: 15 }}
            copyToClipboard="try_demo_copyToClipboard"
          />
        </div>
        <CardDemo>
          <InputBoolean label="icon" value={icon} onChange={setIcon} />
          <InputBoolean label="label" value={label} onChange={setLabel} />
          <InputBoolean
            label="labelRequired"
            value={labelRequired}
            onChange={setLabelRequired}
          />
          <InputBoolean label="tooltip" value={tooltip} onChange={setTooltip} />
          <InputBoolean label="onClick" value={onClick} onChange={setOnclick} />
          <InputBoolean
            label="selected"
            value={selected}
            onChange={setSelected}
          />
          <InputBoolean
            label="disabled"
            value={disabled}
            onChange={setDisabled}
          />
          <InputBoolean label="menu" value={menu} onChange={setMenu} />
          <InputBoolean label="avatar" value={avatar} onChange={setAvatar} />
          <InputBoolean
            label="labelPosition"
            value={labelPosition}
            onChange={setLabelPosition}
          />
          <InputBoolean
            label={`variant: ${variant}`}
            value={variant === "light"}
            onChange={onChangeVariant}
          />
        </CardDemo>
      </div>
    </div>
  );
};

export default BtnDemo;
