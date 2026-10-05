import * as React from "react";
import Text from "../Text";
import Toolbar from "../Toolbar";
import FieldText from "../FieldText";
import Divider from "../Divider";
import { ICON_MAP } from "./icon-map";
import Icon from "./Icon";

const SIZES_BOX = 100;
const STYLE_BOX: React.CSSProperties = {
  borderRadius: 10,
  border: "1px solid #ccc",
  margin: 5,
  display: "inline-flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  width: SIZES_BOX,
  minWidth: SIZES_BOX,
  maxWidth: SIZES_BOX,
  height: SIZES_BOX,
  minHeight: SIZES_BOX,
  maxHeight: SIZES_BOX,
  overflow: "hidden",
};
const STYLE_BOX_ICON: React.CSSProperties = {
  fontSize: 30,
};
const STYLE_BOX_TEXT: React.CSSProperties = {
  width: "inherit",
  marginTop: 10,
  padding: "0 10px",
  boxSizing: "border-box",
  textAlign: "center",
};
const iconNames = Object.keys(ICON_MAP).sort();

export default {
  title: "core/Icon",
  component: Icon,
};

const ExampleStory = () => {
  const [search, setSearch] = React.useState("");

  return (
    <div
      style={{
        padding: 10,
        width: "100%",
        height: "inherit",
        overflow: "overlay",
        boxSizing: "border-box",
      }}
    >
      <Divider />
      <Toolbar style={{ backgroundColor: "#ccc" }}>
        <Text
          weight="bolder"
          size={5}
          children={`Icone disponibili (${iconNames.length})`}
        />
        <div style={{ flex: 1 }} />
        <FieldText
          placeholder="Search..."
          style={{ width: 400, margin: 0 }}
          value={search}
          onChange={setSearch}
        />
      </Toolbar>
      <p>
        Le icone provengono da{" "}
        <a
          href="https://hugeicons.com/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Hugeicons
        </a>{" "}
        (pacchetto free, stile &quot;Stroke Rounded&quot;). Per aggiungerne di
        nuove: importarle in <code>icon-map.ts</code> da{" "}
        <code>@hugeicons/core-free-icons</code> e mapparle sulla chiave stringa
        usata nel codice (es. <code>children=&quot;warning&quot;</code>
        ).
      </p>
      {iconNames
        .filter(name => name.includes(search))
        .map(name => (
          <div key={name} style={STYLE_BOX}>
            <Icon style={STYLE_BOX_ICON} children={name} />
            <Text style={STYLE_BOX_TEXT} children={name} ellipsis />
          </div>
        ))}
    </div>
  );
};

export const Default = ExampleStory.bind({});
