import Portal from "./Portal";

export default {
  title: "core/Portal",
  component: Portal,
};

const ExampleStory = () => (
  <>
    <p>div_with_p_1</p>
    <p>div_with_p_2</p>
    <p>
      <div>
        div_with_p_3
        <Portal>
          <div style={{ border: "1px solid #f00" }}>
            <p>
              Portal allows you to hang a certain element in the root node of
              the application from wherever it is defined
            </p>
            <p>This Portal with border red is defined inside div 3</p>
          </div>
        </Portal>
      </div>
    </p>
    <p>div_with_p_4</p>
    <p>div_with_p_5</p>
  </>
);
export const Example = ExampleStory.bind({});
