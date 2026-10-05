import * as React from "react";
import DemoCmp from "./Demo";
import Popover from ".";

export default {
  title: "core/Popover",
  component: Popover,
};

export const Demo = DemoCmp.bind({});

const ExampleStory = args => {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const onOpen = React.useCallback(() => setOpen(true), []);
  const onClose = React.useCallback(() => setOpen(false), []);

  return (
    <div
      style={{
        height: "inherit",
        width: "inherit",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
        border: "1px solid #f00",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <button ref={setAnchorEl} onClick={onOpen} children="CLICK ME" />
      <Popover
        {...args}
        open={open}
        onClose={onClose}
        anchorEl={anchorEl}
        anchorReference="anchorEl"
        originAnchor={{
          vertical: "bottom",
          horizontal: "left",
        }}
        originTransf={{
          vertical: "top",
          horizontal: "left",
        }}
      >
        <div style={{ padding: 20 }}> The content of the Popover</div>
      </Popover>
    </div>
  );
};
export const Example = ExampleStory.bind({});

export const Custom = ExampleStory.bind({});
Custom.args = {
  style: { backgroundColor: "#f00", padding: 50 },
};
