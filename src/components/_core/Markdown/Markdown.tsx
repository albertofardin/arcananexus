"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export interface IMarkdown {
  content: string;
  className?: string;
}

/** Rende contenuto markdown (GFM) con la tipografia del tema */
const Markdown = ({ content, className }: IMarkdown) => (
  <div
    className={cn(
      "prose prose-slate max-w-none",
      "prose-headings:font-bold prose-headings:tracking-tight",
      "prose-h1:text-3xl prose-h1:mb-4",
      "prose-h2:text-2xl prose-h2:mb-3 prose-h2:mt-8",
      "prose-h3:text-xl prose-h3:mb-2 prose-h3:mt-6",
      "prose-p:text-base prose-p:leading-7 prose-p:mb-4",
      "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
      "prose-strong:font-bold prose-strong:text-fg",
      "prose-ul:my-4 prose-ul:list-disc prose-ul:pl-6",
      "prose-ol:my-4 prose-ol:list-decimal prose-ol:pl-6",
      "prose-li:my-1",
      "prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic",
      "prose-code:bg-muted-bg prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:before:content-none prose-code:after:content-none",
      "prose-pre:bg-muted-bg prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto",
      "prose-img:rounded-lg prose-img:shadow-md",
      className
    )}
  >
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
  </div>
);

export default Markdown;
