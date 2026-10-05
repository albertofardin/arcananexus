import Text from "../Text";
import Card from ".";

const style = { padding: "10px 25px", margin: 10 };

export default {
  title: "core/Card",
  component: Card,
};

const ExampleStory = () => (
  <Card style={style}>
    <Text children="THIS IS A CARD" />
  </Card>
);
export const Example = ExampleStory.bind({});

const ElevationStory = () => (
  <>
    {[0, 1, 2, 3, 4, 5, 6, 7].map((k: number) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Card key={k} elevation={k as any} style={style}>
        <Text children={`elevation_${k}`} />
      </Card>
    ))}
    <div style={{ minHeight: 50 }} />
  </>
);
export const Elevation = ElevationStory.bind({});
