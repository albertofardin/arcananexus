import { fn } from "storybook/test";
import BtnCheckbox from "./BtnCheckbox";

export default {
  title: "core/BtnCheckbox",
  component: BtnCheckbox,
  args: {
    style: { margin: 20 },
    onChange: fn(),
    checked: false,
    color: "#f00",
    label: "BtnCheckbox label",
  },
};

const Story = p => <BtnCheckbox {...p} />;

export const Default = Story.bind({});

export const Disabled = Story.bind({});
Disabled.args = {
  disabled: true,
};

export const Selected = Story.bind({});
Selected.args = {
  selected: true,
};
