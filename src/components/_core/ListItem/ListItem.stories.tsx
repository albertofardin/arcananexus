import { fn } from "storybook/test";
import { SelectType } from "../Checkbox";
import InputFile from "../InputFile";
import ListItem from ".";

const urlImage = "./images/width_128/test_image1.jpeg";

export default {
  title: "core/ListItem",
  component: ListItem,
  args: {
    color: "#f00",
    style: { border: "1px solid #f00" },
    label: "Once Upon a Time, there are a little girl called Red Hood",
    onClick: fn(),
    onMouseEnter: fn(),
    onMouseLeave: fn(),
    copyToClipboard: "_copyToClipboard_",
  },
};

const Story = args => <ListItem {...args} />;

export const Default = Story.bind({});

export const SubLabel = Story.bind({});
SubLabel.args = {
  subLabel: "text text text",
};

export const Ellipsis = Story.bind({});
Ellipsis.args = {
  label:
    "long label long label long label long label long label long label long label long label long label long label long label long label long label long label long label long label long label long label long label long label long label ",
  subLabel:
    "long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB long SUB ",
};

export const Selected = Story.bind({});
Selected.args = {
  selected: true,
};

export const SelectTypeCheck = Story.bind({});
SelectTypeCheck.args = {
  selected: true,
  selectType: SelectType.CHECK,
};

export const SelectTypeRadio = Story.bind({});
SelectTypeRadio.args = {
  selected: true,
  selectType: SelectType.RADIO,
};

export const SelectPositionEnd = Story.bind({});
SelectPositionEnd.args = {
  selected: true,
  selectType: SelectType.CHECK,
  selectPosition: "end",
};

export const Avatar = Story.bind({});
Avatar.args = {
  avatar: urlImage,
};

export const Icon = Story.bind({});
Icon.args = {
  icon: "settings",
};

export const Help = Story.bind({});
Help.args = {
  help: "help tooltip",
};

export const AdditionalChildren = Story.bind({});
AdditionalChildren.args = {
  label: "> click here to select a file <",
  getAdditionalChildren: () => (
    <InputFile acceptFiles="*" onChangeInput={fn()} />
  ),
};
