import Toolbar from "../Toolbar";
import Divider from ".";

export default {
  title: "core/Divider",
  component: Divider,
};

const CmpStory = () => {
  return (
    <>
      <Toolbar />
      <Divider />
      <Toolbar />
    </>
  );
};

export const Example = CmpStory.bind({});
