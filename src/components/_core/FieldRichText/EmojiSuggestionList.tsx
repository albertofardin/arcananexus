"use client";

import * as React from "react";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import type { EmojiItem } from "@tiptap/extension-emoji";
import { cn } from "@/lib/utils";

export interface IEmojiSuggestionListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

/** Menu inline mostrato mentre si digita ":shortcode", con navigazione da tastiera */
const EmojiSuggestionList = React.forwardRef<
  IEmojiSuggestionListRef,
  SuggestionProps<EmojiItem, { name: string }>
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  React.useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = React.useCallback(
    (index: number) => {
      const item = items[index];
      if (item) command({ name: item.name });
    },
    [items, command]
  );

  React.useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (!items.length) return false;

      if (event.key === "ArrowDown") {
        setSelectedIndex(prev => (prev + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex(prev => (prev + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;

  return (
    <div className="flex max-h-56 w-48 flex-col gap-0.5 overflow-y-auto rounded border border-border bg-card p-1 shadow-md">
      {items.map((item, index) => (
        <button
          key={item.name}
          type="button"
          onMouseDown={event => event.preventDefault()}
          onClick={() => selectItem(index)}
          className={cn(
            "flex items-center gap-2 rounded px-2 py-1 text-left text-sm",
            index === selectedIndex && "bg-accent"
          )}
        >
          <span className="text-base">{item.emoji}</span>
          <span className="truncate text-muted-fg">:{item.shortcodes[0]}:</span>
        </button>
      ))}
    </div>
  );
});

EmojiSuggestionList.displayName = "EmojiSuggestionList";

export default EmojiSuggestionList;
