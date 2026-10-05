import * as React from "react";
import { IPopoverListItem } from "../PopoverList";
import FieldSelect, { IFieldSelect } from "./FieldSelect";

const items: IPopoverListItem[] = ["person", "ai", "edit"].map(icon => ({
  id: icon,
  label: icon,
  icon,
}));

const args: IFieldSelect = {
  style: { margin: 30 },
  label: "FieldText",
  icon: "person",
  onChange: a => console.log("onChange", { a }),
  value: "Once Upon a Time, \nthere are a little girl called Red Hood",
  items,
};

export default {
  title: "core/FieldSelect",
  component: FieldSelect,
  args,
};

const StoryDemo = args => {
  const [value, setValue] = React.useState("");
  const onChange = React.useCallback((id: string) => {
    setValue(id);
    console.log("onChange ", id);
  }, []);
  return (
    <FieldSelect {...args} icon={value} value={value} onChange={onChange} />
  );
};
export const Demo = StoryDemo.bind({});

const Story = args => <FieldSelect {...args} />;
export const Default = Story.bind({});

export const Disabled = Story.bind({});
Disabled.args = {
  disabled: true,
};

export const Placeholder = Story.bind({});
Placeholder.args = {
  value: undefined,
};

const manyItems: IPopoverListItem[] = Array.from({ length: 40 }, (_, i) => ({
  id: i,
  label: `Elemento ${i + 1}`,
}));
export const ManyItems = Story.bind({});
ManyItems.args = {
  items: manyItems,
  value: undefined,
};
