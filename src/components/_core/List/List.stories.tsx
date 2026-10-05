import { fn } from "storybook/test";
import ListItem from "../ListItem";
import List from "./List";

export default {
  title: "core/List",
  component: List,
};

const Story = () => (
  <List
    style={{
      width: "auto",
      margin: 25,
      maxHeight: 220,
      border: "1px solid #f00",
    }}
  >
    <div role="presentation" onClick={fn()}>
      <ListItem
        id="nav"
        label="nav_clickPropagation"
        style={{ padding: 10, borderBottom: "1px solid #00f" }}
        onClick={fn()}
      />
    </div>
    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => (
      <ListItem
        key={n}
        id={String(n)}
        label={String(`ListItem_${n}`)}
        style={{ padding: 10, borderBottom: "1px solid #00f" }}
        onClick={fn()}
      />
    ))}
  </List>
);

export const Default = Story.bind({});
