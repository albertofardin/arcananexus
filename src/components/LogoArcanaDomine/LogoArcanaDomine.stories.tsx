import * as React from "react";
import InputBoolean from "../_stories/InputBoolean";
import CardDemo from "../_stories/CardDemo";
import LogoArcanaDomine from "./LogoArcanaDomine";

export default {
  title: "layout/LogoArcanaDomine",
};

const COLORS = ["#000", "#f00", "#00f"];

const DemoComponent = () => {
  const [color, setColor] = React.useState("#000");
  const onClick1 = React.useCallback(() => {
    setColor(COLORS[0]);
  }, []);
  const onClick2 = React.useCallback(() => {
    setColor(COLORS[1]);
  }, []);
  const onClick3 = React.useCallback(() => {
    setColor(COLORS[2]);
  }, []);

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
          <LogoArcanaDomine style={{ height: 100 }} color={color} />
        </div>
        <CardDemo>
          <InputBoolean
            label={COLORS[0]}
            value={color === COLORS[0]}
            onChange={onClick1}
          />
          <InputBoolean
            label={COLORS[1]}
            value={color === COLORS[1]}
            onChange={onClick2}
          />
          <InputBoolean
            label={COLORS[2]}
            value={color === COLORS[2]}
            onChange={onClick3}
          />
        </CardDemo>
      </div>
    </div>
  );
};

export const Demo = DemoComponent.bind({});
