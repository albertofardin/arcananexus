import type { Preview } from "@storybook/nextjs-vite";
import "../src/app/globals.css";
import { Roboto } from "next/font/google";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-roboto",
});

const preview: Preview = {
  decorators: [
    Story => (
      <div
        className={roboto.variable}
        style={{
          overflow: "inherit",
          height: "inherit",
        }}
      >
        <Story />
      </div>
    ),
  ],
  parameters: {
    options: {
      storySort: {
        order: ["Welcome", "Layout", "Core"],
        method: "alphabetical",
      },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
