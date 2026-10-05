import * as React from "react";
import Text, { TextSize } from ".";

export default {
  title: "core/Text",
  component: Text,
};

const lorem =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Suspendisse non ullamcorper odio, nec facilisis dolor. Duis scelerisque sit amet libero a rhoncus. Fusce dapibus dictum leo. Donec eget risus in justo imperdiet ultrices id sit amet leo. Sed tincidunt ipsum commodo ante fringilla, in aliquet augue maximus. In auctor mauris sit amet euismod tempus. Suspendisse tellus tellus, pretium molestie sodales vel, consectetur eu lorem. Aenean vestibulum ut odio nec imperdiet. Nam diam ex, condimentum eu laoreet eget, faucibus rutrum lacus. Nam ut justo ligula. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla egestas mollis ante, sed aliquet quam euismod id. Nunc sit amet condimentum urna. In eu pharetra neque.";
const ExampleStory = () => (
  <>
    <Text
      style={{ margin: 25 }}
      size={3}
      children="The quick brown fox jumps over the lazy dog"
    />
    <Text style={{ margin: 25 }} size={3} children={lorem} />
    <Text style={{ margin: 25, color: "#f00" }} size={3} children={lorem} />
    <Text
      style={{ margin: 25, color: "#00f" }}
      size={3}
      ellipsis
      children={lorem}
    />
  </>
);
export const Example = ExampleStory.bind({});

const SizesStory = () => (
  <>
    {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as TextSize[]).map((n: TextSize) => (
      <React.Fragment key={n}>
        <Text style={{ margin: 25 }} size={n} children={`Text SIZE ${n}`} />
      </React.Fragment>
    ))}
  </>
);
export const Sizes = SizesStory.bind({});

const WeightsStory = () => (
  <>
    <Text
      style={{ margin: 25 }}
      size={3}
      children="Text weight LIGHTER"
      weight="lighter"
    />
    <Text
      style={{ margin: 25 }}
      size={3}
      children="Text weight REGULAR"
      weight="regular"
    />
    <Text
      style={{ margin: 25 }}
      size={3}
      children="Text weight BOLDER"
      weight="bolder"
    />
  </>
);
export const Weights = WeightsStory.bind({});

const EllipsisStory = () => (
  <>
    <Text
      style={{ margin: 25, width: 200, border: "1px solid #f00" }}
      size={3}
      ellipsis
      children="Text very very long with elipssis - here ellipsis is necessary!"
    />
    <Text
      style={{ margin: 25, width: 450, border: "1px solid #f00" }}
      size={3}
      ellipsis
      children="Text very very long - here ellipssis is not necessary"
    />
  </>
);
export const Ellipsis = EllipsisStory.bind({});
