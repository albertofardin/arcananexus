import * as React from "react";
import Text from "../Text";
import BtnBase from "../BtnBase";
import Checkbox, { SelectType } from ".";

const color = "#f00";

export default {
  title: "core/Checkbox",
  component: Checkbox,
};

const ExampleStory = () => {
  const [selected, setSelected] = React.useState(false);
  const onClick = React.useCallback(() => {
    setSelected(!selected);
  }, [selected]);

  return (
    <div style={{ margin: 25 }}>
      {Object.keys(SelectType).map((t: SelectType) => (
        <BtnBase
          color={color}
          key={t}
          style={{
            margin: 5,
            padding: "5px 10px",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            border: `1px solid ${selected ? color : "#ccc"}`,
            borderRadius: 5,
            backgroundColor: "#fff",
          }}
          onClick={onClick}
        >
          <Checkbox
            style={{ marginRight: 10 }}
            color={color}
            type={t}
            selected={selected}
          />
          <Text children={t} />
        </BtnBase>
      ))}
    </div>
  );
};
export const Example = ExampleStory.bind({});
