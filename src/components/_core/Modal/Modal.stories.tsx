import * as React from "react";
import DemoCmp from "./Demo";
import Modal, { IModal } from "./";
import emptyFn from "@/lib/utils/emptyFn";

const args: IModal = {
  open: true,
  onClose: emptyFn,
  title: "ModalTitle",
  titleChildren: <div style={{ background: "#afa" }} children="TITLE" />,
  content: <div style={{ background: "#faa" }} children="CONTENT_" />,
  actions: (
    <>
      <div style={{ flex: 1 }} />
      <div style={{ background: "#aaf" }} children="ACTIONS" />
    </>
  ),
};

export default {
  title: "core/Modal",
  component: Modal,
  args,
};

export const Demo = DemoCmp.bind({});

const ExampleStory = args => <Modal {...args} />;
export const Example = ExampleStory.bind({});

export const MaxDimensions = ExampleStory.bind({});
MaxDimensions.args = {
  style: {
    width: 90000,
    height: 90000,
  },
};

export const MaxContent = ExampleStory.bind({});
MaxContent.args = {
  content: (
    <>
      {Array(50)
        .fill("")
        .map((_, index) => (
          <div
            key={index}
            style={{
              minHeight: 30,
              background: "#faa",
              borderBottom: "1px solid #f00",
            }}
            children={"LISTITEM_" + index}
          />
        ))}
    </>
  ),
};

export const Loading = ExampleStory.bind({});
Loading.args = {
  loading: true,
};

const OnClickStory = () => {
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
      }}
    >
      <button onClick={onOpen}>CLICK ME</button>
      <Modal {...args} open={open} onClose={onClose} />
    </div>
  );
};
export const OnClick = OnClickStory.bind({});
