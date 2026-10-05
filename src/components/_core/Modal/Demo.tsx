import * as React from "react";
import { fn } from "storybook/test";
import Btn from "../Btn";
import Text from "../Text";
import Modal from "./";

const Demo = () => {
  const btnRef = React.useRef(null);
  const [modal, setModal] = React.useState(false);
  const onOpen = React.useCallback(() => setModal(true), []);
  const onClose = React.useCallback(() => setModal(false), []);

  return (
    <div
      style={{
        height: "inherit",
        width: "inherit",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Btn variant="bold" cmpRef={btnRef} label="CLICK ME" onClick={onOpen} />

      <Modal
        open={modal}
        onClose={onClose}
        style={{ padding: 25 }}
        content={
          <>
            <Text children="The content of the Modal" />
            <Text children="The content of the Modal" />
            <Text children="The content of the Modal" />
            <Text children="The content of the Modal" />
            <Btn
              variant="bold"
              label="try menu"
              menu={{
                items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => ({
                  id: String(n),
                  label: "menu_" + n,
                  onClick: fn(),
                })),
              }}
            />
          </>
        }
      />
    </div>
  );
};
export default Demo;
