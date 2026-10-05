import Backdrop from ".";

export default {
  title: "core/Backdrop",
  component: Backdrop,
};

const Story = args => (
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
    <div
      style={{
        width: 100,
        height: 100,
        border: "1px solid red",
        position: "relative",
      }}
    >
      <Backdrop {...args} open />
    </div>

    <button children="button non clickabile a causa del backdrop" />
  </div>
);

export const Example = Story.bind({});

export const Invisible = Story.bind({});
Invisible.args = {
  invisible: true,
};
