import { fn } from "storybook/test";
import Text from "../Text";
import Toolbar from "../Toolbar";
import InputFile from "../InputFile";
import DemoBtn from "./Demo";
import Btn, { IBtn } from ".";

const mapVariantColor = {
  light: "#0085ff",
  bold: "#ff9600",
};

const args: IBtn = {
  icon: "photo_camera",
  label: "Camera_Camera_Camera_Camera_Camera_",
  onClick: fn(),
  copyToClipboard: "_copyToClipboard_",
  tooltip: "tooltip",
  style: { maxWidth: 100 },
};

export default {
  title: "core/Btn",
  component: Btn,
  args,
};

const DemoStory = () => <DemoBtn />;
export const Demo = DemoStory.bind({});

const StorySimple = args => <Btn {...args} />;

const Story = args => (
  <table>
    <thead style={{ backgroundColor: "#f1f1f1", textAlign: "left" }}>
      <tr>
        <th>
          <Text weight="bolder" children="variant" style={{ width: 60 }} />
        </th>
        <th>
          <Text weight="bolder" children="color" style={{ width: 120 }} />
        </th>
        <th>
          <Text weight="bolder" children="icon" />
        </th>
        <th>
          <Text weight="bolder" children="label" />
        </th>
        <th>
          <Text weight="bolder" children="selected" />
        </th>
        <th>
          <Text weight="bolder" children="disabled" />
        </th>
        <th>
          <Text weight="bolder" children="small" />
        </th>
      </tr>
    </thead>
    <tbody>
      {["#1aa74b", "#C07CF1", "#EDCD0E", undefined].map(color =>
        ["light", "bold"].map(v => (
          <tr key={v}>
            <td>
              <Text
                style={{ color: mapVariantColor[v] }}
                weight="bolder"
                children={v}
              />
            </td>
            <td>
              <Text
                style={{
                  fontFamily: "monospace",
                  backgroundColor: "#eee",
                  padding: "0 5px",
                  borderRadius: 2,
                  width: "fit-content",
                }}
                children={String(color)}
              />
            </td>
            <td>
              <Btn {...args} label="" variant={v} color={color} />
            </td>
            <td>
              <Btn {...args} icon="" variant={v} color={color} />
            </td>
            <td>
              <Btn {...args} variant={v} color={color} selected />
            </td>
            <td>
              <Btn {...args} variant={v} color={color} disabled />
            </td>
            <td>
              <Btn {...args} label="" variant={v} color={color} small />
            </td>
          </tr>
        ))
      )}
    </tbody>
  </table>
);

export const Default = Story.bind({});

const menu = {
  items: ["1", "2", "3", "4", "5"].map(n => ({
    id: n,
    label: "listimtem___" + n,
  })),
};

const MenuStory = () => (
  <div
    style={{
      height: "100%",
      width: "100%",
      display: "flex",
      flexDirection: "column",
    }}
  >
    <Toolbar>
      <Btn variant="bold" label="label1" menu={menu} />
      <div style={{ flex: 1 }} />
      <Btn variant="bold" label="label2" menu={menu} />
    </Toolbar>
    <div style={{ flex: 1 }} />
    <Toolbar>
      <Btn variant="bold" label="label_3" menu={menu} />
      <div style={{ flex: 1 }} />
      <Btn variant="bold" label="label_4" menu={menu} />
    </Toolbar>
  </div>
);
export const MenuPosition = MenuStory.bind({});

export const WithInputFile = StorySimple.bind({});
WithInputFile.args = {
  variant: "bold",
  color: "#2857d8",
  label: "Select a file",
  children: <InputFile acceptFiles="*" onChangeInput={fn()} />,
};
