import { fn } from "storybook/test";
import PopoverList from "./PopoverList";
import { IPopoverListItem } from "./PopoverListItem";

export default {
  title: "core/PopoverList",
  component: PopoverList,
  args: {
    open: true,
    onClose: fn(),
    actions: [
      {
        id: "font_download",
        label: "font_download",
        onClick: fn(),
        icon: "font_download",
      },
    ],
  },
};

const Story = args => <PopoverList {...args} />;

export const Example = Story.bind({});

const actionsListCustom: IPopoverListItem[] = [
  {
    id: "font_download",
    label: "font_download",
    onClick: fn(),
    icon: "font_download",
    disabled: true,
  },
  {
    id: "file_copy",
    label: "file_copy",
    onClick: fn(),
    icon: "file_copy",
  },
  {
    id: "send",
    label: "send",
    onClick: fn(),
    icon: "send",
  },
  {
    divider: true,
    id: "edit",
    label: "edit",
    onClick: fn(),
    icon: "edit",
  },
  {
    divider: true,
    id: "Action_1",
    label: "Action_1",
    onClick: fn(),
  },
  {
    id: "Action_2",
    label: "Action_2",
    onClick: fn(),
  },
  {
    divider: true,
    id: "upload",
    label: "upload22",
    onClick: fn(),
  },
];
export const ListCustom = Story.bind({});
ListCustom.args = {
  actions: actionsListCustom,
};

const actionsListVeryLong: IPopoverListItem[] = [];
for (let i = 0; i < 100; i++) {
  const id = `listitem with id: ${i}`;
  actionsListVeryLong.push({ id, label: id });
}
export const ListVeryLong = Story.bind({});
ListVeryLong.args = {
  actions: actionsListVeryLong,
};
