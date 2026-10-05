import * as React from "react";
import Text from "../Text";
import Icon from "../Icon";
import Toolbar from ".";

export default {
  title: "core/Toolbar",
  component: Toolbar,
};

const CmpStory = () => {
  const [count, setCount] = React.useState(0);
  const onCount = React.useCallback(() => {
    setCount(count + 1);
  }, [count]);

  return (
    <>
      <Toolbar style={{ border: "1px solid #f00" }}>
        <Icon children="home" />
        <Text children="This is a toolbar with role 'presentation' " />
        <div style={{ flex: 1 }} />
        <Text children="TEST" />
      </Toolbar>
      <Toolbar style={{ border: "1px solid #00f" }} onClick={onCount}>
        <Icon children="edit" />
        <Text children="This is a toolbar with role 'button' - try click me - COUNT: " />
        <Text children={String(count)} />
      </Toolbar>
    </>
  );
};

export const Example = CmpStory.bind({});
