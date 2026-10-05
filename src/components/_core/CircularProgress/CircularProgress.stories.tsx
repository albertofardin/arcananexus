import CircularProgress from ".";

export default {
  title: "core/CircularProgress",
  component: CircularProgress,
};

const VariantIndeterminateStory = () => (
  <>
    <CircularProgress size={60} variant="indeterminate" />
  </>
);
export const VariantIndeterminate = VariantIndeterminateStory.bind({});

const VariantDeterminateStory = () => (
  <>
    <CircularProgress size={60} variant="determinate" value={0} />
    <CircularProgress size={60} variant="determinate" value={25} />
    <CircularProgress size={60} variant="determinate" value={50} />
    <CircularProgress size={60} variant="determinate" value={75} />
    <CircularProgress size={60} variant="determinate" value={100} />
  </>
);
export const VariantDeterminate = VariantDeterminateStory.bind({});

const SizeStory = () => (
  <>
    <CircularProgress style={{ margin: 10 }} size={25} />
    <CircularProgress style={{ margin: 10 }} size={50} />
    <CircularProgress style={{ margin: 10 }} size={75} />
    <CircularProgress style={{ margin: 10 }} size={100} />
  </>
);
export const Size = SizeStory.bind({});

const ThicknessStory = () => (
  <>
    <CircularProgress style={{ margin: 10 }} size={60} thickness={5} />
    <CircularProgress style={{ margin: 10 }} size={60} thickness={10} />
    <CircularProgress style={{ margin: 10 }} size={60} thickness={20} />
    <CircularProgress style={{ margin: 10 }} size={60} thickness={30} />
    <CircularProgress style={{ margin: 10 }} size={60} thickness={30} />
    <CircularProgress style={{ margin: 10 }} size={60} thickness={40} />
    <CircularProgress style={{ margin: 10 }} size={60} thickness={50} />
    <CircularProgress style={{ margin: 10 }} size={60} thickness={60} />
  </>
);
export const Thickness = ThicknessStory.bind({});
