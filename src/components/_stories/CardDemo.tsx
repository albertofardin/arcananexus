import * as React from "react";
import Card from "../_core/Card";
import List from "../_core/List";

export const CardDemo = ({
  children,
}: {
  children?: React.ReactElement | React.ReactNode;
}) => (
  <Card
    elevation={5}
    style={{
      backgroundColor: "#fafafa",
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      margin: 25,
      width: "fit-content",
      padding: 0,
    }}
  >
    <List
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
      }}
      children={children}
    />
  </Card>
);

export default CardDemo;
