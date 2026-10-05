import * as React from "react";
import { fn } from "storybook/test";
import Zoom from "./Zoom";

export default {
  title: "core/Transitions/Zoom",
  component: Zoom,
  args: {
    onEnter: fn(),
    onEntered: fn(),
    onExit: fn(),
    onExited: fn(),
  },
};

const ExampleStory = args => {
  const [open, setOpen] = React.useState(true);
  const onClick = React.useCallback(() => setOpen(!open), [open]);
  return (
    <div
      style={{
        height: "inherit",
        width: "inherit",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        border: "1px solid #f00",
      }}
    >
      <button onClick={onClick}>CLICK ME</button>
      <Zoom {...args} open={open}>
        <div style={{ background: "#f00", width: 200, height: 200 }}>
          !!!ECCOMI!!!
        </div>
      </Zoom>
    </div>
  );
};
export const Example = ExampleStory.bind({});
