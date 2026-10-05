import Divider from "../Divider";
import Text from "../Text";
import Avatar from ".";

export default {
  title: "core/Avatar",
  component: Avatar,
};

const style: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  padding: "5px 20px",
  gap: 10,
};
const src = "/images/width_128/test_image2.jpeg";
const ExampleStory = () => (
  <>
    <div style={style}>
      <Avatar size={100} src={src} />
      <Avatar src={src} />
      <Text children="src found" />
    </div>
    <Divider />
    <div style={style}>
      <Avatar size={100} src={"./undefined"} />
      <Avatar src={"./undefined"} />
      <Text children="src not found (try to download)" />
    </div>
    <Divider />
    <div style={style}>
      <Avatar size={100} src={null} />
      <Avatar src={null} />
      <Text children="src null" />
    </div>
    <Divider />
    <div style={style}>
      <Avatar size={100} text="AB" />
      <Avatar text="AB" />
      <Text children="no src + text" />
    </div>
    <Divider />
    <div style={style}>
      <Avatar size={100} icon="settings" />
      <Avatar icon="settings" />
      <Text children="no src + icon" />
    </div>
    <Divider />
    <div style={style}>
      <Avatar style={{ backgroundColor: "#f00" }} size={100} />
      <Avatar style={{ backgroundColor: "#f00" }} icon="settings" />
      <Text children="no src + color" />
    </div>
    <Divider />
  </>
);
export const Example = ExampleStory.bind({});
