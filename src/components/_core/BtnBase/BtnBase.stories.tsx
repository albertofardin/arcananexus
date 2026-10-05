import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import Text from "../Text";
import BtnBase from ".";

const color = "#f00";

const style = {
  padding: 25,
  margin: 25,
  border: `1px solid ${color}`,
};

const meta: Meta<typeof BtnBase> = {
  title: "core/BtnBase",
  component: BtnBase,
};

export default meta;

type Story = StoryObj<typeof BtnBase>;

export const Example: Story = {
  args: {
    color,
    style,
    onClick: fn(),
    onDoubleClick: fn(),
    onContextMenu: fn(),
    onMouseEnter: fn(),
    onMouseLeave: fn(),
    children: <Text children="THIS IS A BUTTON" />,
  },
};

export const Tooltip: Story = {
  args: {
    color,
    style,
    tooltip: "__tooltip__",
    children: <Text children="THIS IS A BUTTON" />,
  },
};

export const Disabled: Story = {
  args: {
    color,
    style,
    children: <Text children="THIS IS A BUTTON" />,
  },
};
