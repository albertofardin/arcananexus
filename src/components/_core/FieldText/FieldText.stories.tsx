import FieldText, { IFieldText } from "./FieldText";

const args: IFieldText = {
  style: { margin: 30 },
  label: "FieldText",
  icon: "person",
  onKeyPress: () => console.log("onKeyPress"),
  onChange: () => console.log("onChange"),
  onBlur: () => console.log("onBlur"),
  onFocus: () => console.log("onFocus"),
  value: "Once Upon a Time, \nthere are a little girl called Red Hood",
};

export default {
  title: "core/FieldText",
  component: FieldText,
  args,
};

const Story = args => <FieldText {...args} />;
export const Default = Story.bind({});

export const Disabled = Story.bind({});
Disabled.args = {
  disabled: true,
};

export const Placeholder = Story.bind({});
Placeholder.args = {
  value: undefined,
};

export const Password = Story.bind({});
Password.args = {
  icon: "lock",
  type: "password",
};

export const Multiline = Story.bind({});
Multiline.args = {
  icon: "",
  multiline: true,
};
