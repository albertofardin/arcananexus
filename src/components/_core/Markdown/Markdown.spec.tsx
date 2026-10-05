/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import Markdown from ".";
import { render, screen } from "@/test/helpers/test-utils";

describe("Markdown Component", () => {
  it("should render plain text", () => {
    render(<Markdown content="Hello, World!" />);
    expect(screen.getByText("Hello, World!")).toBeInTheDocument();
  });

  it("should render headings correctly", () => {
    const content = `# Heading 1
## Heading 2
### Heading 3`;

    render(<Markdown content={content} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Heading 1"
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Heading 2"
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Heading 3"
    );
  });

  it("should render paragraphs", () => {
    const content = `First paragraph.

Second paragraph.`;

    const { container } = render(<Markdown content={content} />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent("First paragraph.");
    expect(paragraphs[1]).toHaveTextContent("Second paragraph.");
  });

  it("should render links", () => {
    const content = "[Link Text](https://example.com)";

    render(<Markdown content={content} />);
    const link = screen.getByRole("link", { name: "Link Text" });
    expect(link).toHaveAttribute("href", "https://example.com");
  });

  it("should render bold text", () => {
    const content = "This is **bold text**.";

    const { container } = render(<Markdown content={content} />);
    const strong = container.querySelector("strong");
    expect(strong).toHaveTextContent("bold text");
  });

  it("should render italic text", () => {
    const content = "This is *italic text*.";

    const { container } = render(<Markdown content={content} />);
    const em = container.querySelector("em");
    expect(em).toHaveTextContent("italic text");
  });

  it("should render unordered lists", () => {
    const content = `- Item 1
- Item 2
- Item 3`;

    const { container } = render(<Markdown content={content} />);
    const ul = container.querySelector("ul");
    const items = container.querySelectorAll("li");
    expect(ul).toBeInTheDocument();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Item 1");
    expect(items[1]).toHaveTextContent("Item 2");
    expect(items[2]).toHaveTextContent("Item 3");
  });

  it("should render ordered lists", () => {
    const content = `1. First
2. Second
3. Third`;

    const { container } = render(<Markdown content={content} />);
    const ol = container.querySelector("ol");
    const items = container.querySelectorAll("li");
    expect(ol).toBeInTheDocument();
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("First");
    expect(items[1]).toHaveTextContent("Second");
    expect(items[2]).toHaveTextContent("Third");
  });

  it("should render blockquotes", () => {
    const content = "> This is a quote.";

    const { container } = render(<Markdown content={content} />);
    const blockquote = container.querySelector("blockquote");
    expect(blockquote).toBeInTheDocument();
    expect(blockquote).toHaveTextContent("This is a quote.");
  });

  it("should render inline code", () => {
    const content = "Use `console.log()` for debugging.";

    const { container } = render(<Markdown content={content} />);
    const code = container.querySelector("code");
    expect(code).toHaveTextContent("console.log()");
  });

  it("should render code blocks", () => {
    const content = "```javascript\nconst x = 42;\n```";

    const { container } = render(<Markdown content={content} />);
    const pre = container.querySelector("pre");
    const code = container.querySelector("code");
    expect(pre).toBeInTheDocument();
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent("const x = 42;");
  });

  it("should render tables (GFM)", () => {
    const content = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`;

    const { container } = render(<Markdown content={content} />);
    const table = container.querySelector("table");
    const headers = container.querySelectorAll("th");
    const cells = container.querySelectorAll("td");

    expect(table).toBeInTheDocument();
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("Header 1");
    expect(headers[1]).toHaveTextContent("Header 2");
    expect(cells).toHaveLength(4);
    expect(cells[0]).toHaveTextContent("Cell 1");
    expect(cells[1]).toHaveTextContent("Cell 2");
    expect(cells[2]).toHaveTextContent("Cell 3");
    expect(cells[3]).toHaveTextContent("Cell 4");
  });

  it("should render strikethrough (GFM)", () => {
    const content = "This is ~~deleted~~ text.";

    const { container } = render(<Markdown content={content} />);
    const del = container.querySelector("del");
    expect(del).toHaveTextContent("deleted");
  });

  it("should render task lists (GFM)", () => {
    const content = `- [x] Completed task
- [ ] Incomplete task`;

    const { container } = render(<Markdown content={content} />);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("should apply custom className", () => {
    const { container } = render(
      <Markdown content="Test" className="custom-class" />
    );
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass("custom-class");
  });

  it("should have prose classes for typography", () => {
    const { container } = render(<Markdown content="Test" />);
    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass("prose");
    expect(wrapper).toHaveClass("prose-slate");
  });

  it("should render complex markdown with multiple elements", () => {
    const content = `# Event Description

This is the main paragraph with **bold** and *italic* text.

## Features

- Feature 1
- Feature 2
- Feature 3

> Important note about the event.

### Code Example

\`\`\`typescript
const event = { name: "Test Event" };
\`\`\`

[Visit Website](https://example.com)`;

    const { container } = render(<Markdown content={content} />);

    // Check that various elements are rendered
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Event Description"
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Features"
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(
      "Code Example"
    );
    expect(container.querySelector("blockquote")).toBeInTheDocument();
    expect(container.querySelector("ul")).toBeInTheDocument();
    expect(container.querySelector("pre")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Visit Website" })).toHaveAttribute(
      "href",
      "https://example.com"
    );
  });

  it("should handle empty content", () => {
    const { container } = render(<Markdown content="" />);
    const wrapper = container.firstChild;
    expect(wrapper).toBeInTheDocument();
    expect(wrapper?.textContent).toBe("");
  });

  it("should sanitize potentially dangerous content", () => {
    // react-markdown sanitizes by default
    const content = '<script>alert("XSS")</script>';

    const { container } = render(<Markdown content={content} />);
    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(0);
  });
});
