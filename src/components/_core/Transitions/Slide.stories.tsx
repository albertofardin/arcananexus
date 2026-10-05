import * as React from "react";
import { fn } from "storybook/test";
import Slide from "./Slide";

export default {
  title: "core/Transitions/Slide",
  component: Slide,
  args: {
    onEnter: fn(),
    onEntered: fn(),
    onExit: fn(),
    onExited: fn(),
  },
};

const ExampleStory = args => {
  const [open, setOpen] = React.useState(false);
  const [direction, setDirection] = React.useState(
    "top" as "top" | "bottom" | "left" | "right"
  );
  const onClick = React.useCallback(() => setOpen(!open), [open]);
  const onDirTop = React.useCallback(() => setDirection("top"), []);
  const onDirBottom = React.useCallback(() => setDirection("bottom"), []);
  const onDirLeft = React.useCallback(() => setDirection("left"), []);
  const onDirRight = React.useCallback(() => setDirection("right"), []);

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
      <div>
        <input
          type="checkbox"
          checked={direction === "top"}
          onClick={onDirTop}
        />
        <label children="Top" />
      </div>
      <div>
        <input
          type="checkbox"
          checked={direction === "bottom"}
          onClick={onDirBottom}
        />
        <label children="Bottom" />
      </div>
      <div>
        <input
          type="checkbox"
          checked={direction === "left"}
          onClick={onDirLeft}
        />
        <label children="Left" />
      </div>
      <div>
        <input
          type="checkbox"
          checked={direction === "right"}
          onClick={onDirRight}
        />
        <label children="Right" />
      </div>
      <div
        style={{
          overflow: "hidden",
          position: "relative",
          border: "1px solid blue",
          height: 300,
          width: 300,
        }}
      >
        <Slide {...args} open={open} direction={direction}>
          <div style={{ background: "#f00", width: "100%", height: "100%" }}>
            !!!ECCOMI!!!
          </div>
        </Slide>
      </div>
    </div>
  );
};
export const Example = ExampleStory.bind({});
