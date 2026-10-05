import BtnLink, { IBtnLink } from ".";

const args: IBtnLink = {
  href: "#",
  icon: "arrow_back",
  label: "Torna ai tipi di dato",
  labelSize: 2,
};

export default {
  title: "core/BtnLink",
  component: BtnLink,
  args,
};

const StorySimple = (args: IBtnLink) => <BtnLink {...args} />;
export const Simple = StorySimple.bind({});

const StoryVariants = (args: IBtnLink) => (
  <div style={{ display: "flex", gap: 16 }}>
    <BtnLink {...args} variant="light" />
    <BtnLink {...args} variant="bold" />
    <BtnLink {...args} small />
  </div>
);
export const Variants = StoryVariants.bind({});
