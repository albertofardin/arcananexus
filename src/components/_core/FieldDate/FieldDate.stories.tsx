import FieldDate, { IFieldDate } from "./FieldDate";

const args: IFieldDate = {
  style: { margin: 30 },
  label: "FieldDate",
  onKeyPress: () => console.log("onKeyPress"),
  onChange: () => console.log("onChange"),
  onBlur: () => console.log("onBlur"),
  onFocus: () => console.log("onFocus"),
  value: "2000-01-01",
};

export default {
  title: "core/FieldDate",
  component: FieldDate,
  args,
};

const Story = args => <FieldDate {...args} />;
export const Default = Story.bind({});

export const Disabled = Story.bind({});
Disabled.args = {
  disabled: true,
};

export const Placeholder = Story.bind({});
Placeholder.args = {
  value: undefined,
};

export const MinMax = Story.bind({});
MinMax.args = {
  min: "1900-01-01",
  max: "2010-12-31",
};
