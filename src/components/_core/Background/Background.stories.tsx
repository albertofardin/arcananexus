import * as React from "react";
import Card from "../Card";
import Background from ".";

export default {
  title: "core/Background",
  component: Background,
};

const DemoComponent = () => {
  const [color1, setColor1] = React.useState("#0038B1");
  const onColor1 = React.useCallback(event => {
    setColor1(event.target.value);
  }, []);
  const [color2, setColor2] = React.useState("#FFA300");
  const onColor2 = React.useCallback(event => {
    setColor2(event.target.value);
  }, []);
  const [child, setChild] = React.useState(false);
  const onChild = React.useCallback(() => {
    setChild(!child);
  }, [child]);

  return (
    <div
      style={{
        height: "inherit",
        width: "inherit",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div>
        <button
          style={{ width: 150, margin: 10 }}
          children={`have children - ${child ? "ON" : "OFF"}`}
          onClick={onChild}
        />
        <input
          type="string"
          style={{ width: 150, margin: 5 }}
          value={color2}
          onChange={onColor2}
        />
        <input
          type="string"
          style={{ width: 150, margin: 5 }}
          value={color1}
          onChange={onColor1}
        />
      </div>
      <Background color1={color1} color2={color2}>
        <div style={{ flex: 1 }} />
        {!child ? null : (
          <Card style={{ padding: 25 }}>THIS IS MY CHILDREN</Card>
        )}
        <div style={{ flex: 1 }} />
      </Background>
    </div>
  );
};

export const Example = DemoComponent.bind({});
