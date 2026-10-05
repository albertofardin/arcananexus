import Skeleton from ".";

export default {
  title: "core/Skeleton",
  component: Skeleton,
};

const CmpStory = () => {
  return (
    <div className="space-y-2">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </div>
  );
};

export const Example = CmpStory.bind({});
