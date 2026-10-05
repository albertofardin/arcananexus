import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Tooltip from ".";

const meta: Meta<typeof Tooltip> = {
  title: "core/Tooltip",
  component: Tooltip,
  args: {
    title: "tooltip",
  },
};

export default meta;

type Story = StoryObj<typeof Tooltip>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ExampleStory = (args: any) => (
  <div
    style={{
      width: 300,
      height: 100,
      border: `1px solid #f00`,
      overflow: "hidden",
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      margin: "auto",
    }}
  >
    <div
      style={{
        background: "#f00",
        position: "absolute",
        right: 0,
        left: 0,
        top: 0,
        width: "inherit",
        height: 10,
        margin: "auto",
        zIndex: 5,
      }}
    />

    <Tooltip {...args}>
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          margin: "auto",
          border: "1px solid #00f",
          height: 50,
          width: 100,
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        Example
      </div>
    </Tooltip>
  </div>
);

export const Example: Story = {
  render: args => <ExampleStory {...args} />,
};

export const PlacementTop: Story = {
  render: args => <ExampleStory {...args} />,
  args: {
    open: true,
    place: "top",
  },
};

export const PlacementRight: Story = {
  render: args => <ExampleStory {...args} />,
  args: {
    open: true,
    place: "right",
  },
};

export const PlacementLeft: Story = {
  render: args => <ExampleStory {...args} />,
  args: {
    open: true,
    place: "left",
  },
};

export const PlacementBottom: Story = {
  render: args => <ExampleStory {...args} />,
  args: {
    open: true,
    place: "bottom",
  },
};

export const RenderArrayString: Story = {
  render: args => <ExampleStory {...args} />,
  args: {
    title: ["line_1", "line_2", "line_3", "very long line_4 with emoji ✅"],
  },
};

export const RenderJsxElement: Story = {
  render: args => <ExampleStory {...args} />,
  args: {
    title: (
      <>
        <p style={{ color: "#fff" }}>TEST size0</p>

        <p style={{ color: "#fff" }}>TEST size1</p>

        <p style={{ color: "#fff" }}>TEST size2</p>

        <p style={{ color: "#f00" }}>TEST colored</p>
      </>
    ),
  },
};

const ExampleStory2 = () => (
  <div
    style={{
      width: 300,
      height: 100,
      border: `1px solid #f00`,
      overflow: "hidden",
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      margin: "auto",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 16,
    }}
  >
    <Tooltip
      open
      title={
        <>
          <span>TooltipTextExample_nodejs</span>
        </>
      }
    >
      <div
        style={{
          border: "1px solid #00f",
          height: 50,
          width: 100,
        }}
      >
        A
      </div>
    </Tooltip>

    <Tooltip open title={"TooltipTextExample_string"}>
      <div
        style={{
          border: "1px solid #00f",
          height: 50,
          width: 100,
        }}
      >
        B
      </div>
    </Tooltip>
  </div>
);

export const RenderJsxElemen2: Story = {
  render: () => <ExampleStory2 />,
};

export const RenderVeryLongText: Story = {
  render: args => <ExampleStory {...args} />,
  args: {
    title:
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nunc mattis, urna non fringilla malesuada, justo nibh dignissim ante, sed ornare ligula odio sed magna. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Donec sit amet dignissim nibh. Integer eu diam quis dolor dapibus auctor. Mauris porta lectus non ex gravida, vel vehicula nisl dapibus. Aenean ut pretium erat, eget vestibulum urna. Sed blandit, felis sit amet ultrices elementum, magna libero congue felis, eu molestie ligula massa vel orci. Pellentesque euismod lectus diam, finibus cursus velit laoreet nec. Etiam eget eros a justo consequat condimentum vel nec sem. Cras eleifend diam ut eros ornare placerat.",
  },
};
