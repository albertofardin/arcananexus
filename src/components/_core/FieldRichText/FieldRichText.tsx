"use client";

import * as React from "react";
import {
  useEditor,
  EditorContent,
  ReactRenderer,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import {
  Emoji,
  gitHubEmojis,
  shortcodeToEmoji,
  type EmojiItem,
} from "@tiptap/extension-emoji";
import type {
  SuggestionKeyDownProps,
  SuggestionProps,
} from "@tiptap/suggestion";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import BtnBase from "../BtnBase";
import Icon from "../Icon";
import Popover from "../Popover";
import Field from "../Field";
import CircularProgress from "../CircularProgress";
import { useToast } from "../Toast";
import EmojiSuggestionList, {
  type IEmojiSuggestionListRef,
} from "./EmojiSuggestionList";
import { RICH_TEXT_COLORS } from "./colors";
import { RICH_TEXT_EMOJI_SHORTCODES } from "./emojis";
import { cn } from "@/lib/utils";
import { useUploadThing } from "@/lib/uploadthing-client";
import { convertImageFileToWebp } from "@/components/AvatarUpload/AvatarUpload";
import { CAMPAIGN_IMAGE_WEBP_QUALITY } from "@/lib/validations/campaignPresentationUpload";

export interface IFieldRichText {
  className?: string;
  style?: React.CSSProperties;
  label?: React.ReactNode;
  labelMandatory?: boolean;
  labelIcon?: string;
  icon?: string;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  minHeight?: number;
  /** Slug della campagna, necessario per il caricamento di immagini da file sull'endpoint UploadThing `richTextImageUploader` (T-047). Ignorato quando `uploadEndpoint="supportAttachmentUploader"` (T-0xx, "Supporto": non campaign-scoped) — in quel caso basta la sessione, nessuno slug richiesto. Se nessuno dei due si applica, il pulsante di upload non viene mostrato (es. `FieldRichText` in sola lettura o senza contesto). */
  campaignSlug?: string;
  /** Endpoint UploadThing per il pulsante di caricamento immagini da file. Default `"richTextImageUploader"` (richiede `campaignSlug`); `"supportAttachmentUploader"` per i contesti senza campagna (es. i messaggi di Supporto). */
  uploadEndpoint?: "richTextImageUploader" | "supportAttachmentUploader";
}

const emojiSuggestionItems = ({ query }: { query: string }): EmojiItem[] => {
  const search = query.toLowerCase().trim();
  if (!search) return [];

  return gitHubEmojis
    .filter(item =>
      item.shortcodes.some(code => code.toLowerCase().startsWith(search))
    )
    .slice(0, 8);
};

const renderEmojiSuggestion = () => {
  let component: ReactRenderer<
    IEmojiSuggestionListRef,
    SuggestionProps<EmojiItem, { name: string }>
  >;
  let unmount: (() => void) | undefined;

  return {
    onStart: (props: SuggestionProps<EmojiItem, { name: string }>) => {
      component = new ReactRenderer(EmojiSuggestionList, {
        props,
        editor: props.editor,
      });
      unmount = props.mount(component.element);
    },
    onUpdate: (props: SuggestionProps<EmojiItem, { name: string }>) => {
      component.updateProps(props);
    },
    onKeyDown: (props: SuggestionKeyDownProps) => {
      if (props.event.key === "Escape") {
        unmount?.();
        return true;
      }
      return component.ref?.onKeyDown(props) ?? false;
    },
    onExit: () => {
      unmount?.();
      component.destroy();
    },
  };
};

const ToolbarButton = ({
  active,
  tooltip,
  onClick,
  children,
}: {
  active?: boolean;
  tooltip: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <BtnBase
    tooltip={tooltip}
    onClick={onClick}
    className={cn(
      "inline-flex h-7 min-w-7 items-center justify-center rounded transition-colors",
      "border border-transparent hover:border-primary",
      active &&
        "border-primary bg-[color-mix(in_srgb,var(--primary)_10%,var(--bg))]"
    )}
  >
    {children}
  </BtnBase>
);

const ColorSwatch = ({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string | null;
  active: boolean;
  onClick: () => void;
}) => (
  <BtnBase
    tooltip={label}
    onClick={onClick}
    className={cn(
      "flex h-6 w-6 items-center justify-center rounded-full border transition-transform",
      active ? "scale-110 border-fg" : "border-border hover:scale-105"
    )}
  >
    <span
      className="h-4 w-4 rounded-full"
      style={{ backgroundColor: value ?? "var(--fg)" }}
    />
  </BtnBase>
);

const ColorPickerButton = ({
  activeColor,
  onSelect,
}: {
  activeColor: string | null;
  onSelect: (value: string | null) => void;
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <BtnBase
        ref={setAnchorEl}
        tooltip="Colore testo"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center justify-center gap-1 rounded border border-transparent px-1.5 transition-colors hover:border-primary"
      >
        <span
          className="h-4 w-4 rounded-full border border-border"
          style={{ backgroundColor: activeColor ?? "var(--fg)" }}
        />
        <Icon className="text-[12px] text-inherit" children="expand_more" />
      </BtnBase>
      <Popover open={open} anchorEl={anchorEl} onClose={() => setOpen(false)}>
        <div className="grid grid-cols-4 gap-1.5 p-2">
          {RICH_TEXT_COLORS.map(({ label, value: colorValue }) => (
            <ColorSwatch
              key={label}
              label={label}
              value={colorValue}
              active={
                colorValue === null ? !activeColor : activeColor === colorValue
              }
              onClick={() => {
                onSelect(colorValue);
                setOpen(false);
              }}
            />
          ))}
        </div>
      </Popover>
    </>
  );
};

/** Pulsante toolbar che apre un popover con un campo URL (usato per link e immagini) */
const UrlPopoverButton = ({
  tooltip,
  icon,
  active,
  placeholder,
  initialValue = "",
  submitLabel,
  onSubmit,
  onRemove,
}: {
  tooltip: string;
  icon: React.ReactNode;
  active?: boolean;
  placeholder: string;
  initialValue?: string;
  submitLabel: string;
  onSubmit: (url: string) => void;
  onRemove?: () => void;
}) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(initialValue);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
    setOpen(false);
  };

  return (
    <>
      <BtnBase
        ref={setAnchorEl}
        tooltip={tooltip}
        onClick={() => {
          setValue(initialValue);
          setOpen(true);
        }}
        className={cn(
          "inline-flex h-7 min-w-7 items-center justify-center rounded transition-colors",
          "border border-transparent hover:border-primary",
          active &&
            "border-primary bg-[color-mix(in_srgb,var(--primary)_10%,var(--bg))]"
        )}
      >
        {icon}
      </BtnBase>
      <Popover open={open} anchorEl={anchorEl} onClose={() => setOpen(false)}>
        <div className="flex items-center gap-1.5 p-2">
          <input
            autoFocus
            type="url"
            value={value}
            placeholder={placeholder}
            onChange={event => setValue(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSubmit();
              }
            }}
            className="h-7 w-48 rounded border border-border bg-bg px-2 text-sm text-fg outline-none focus:border-primary"
          />
          <BtnBase
            tooltip={submitLabel}
            onClick={handleSubmit}
            className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-primary"
          >
            <Icon className="text-[14px] text-inherit" children="check" />
          </BtnBase>
          {onRemove && (
            <BtnBase
              tooltip="Rimuovi link"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
              className="flex h-7 w-7 items-center justify-center rounded border border-transparent hover:border-fail"
            >
              <Icon className="text-[14px] text-inherit" children="unlink" />
            </BtnBase>
          )}
        </div>
      </Popover>
    </>
  );
};

// Deve restare allineato al `maxFileSize` di `richTextImageUploader` in
// `src/app/api/uploadthing/core.ts`, stesso valore/motivazione di
// `MAX_SIZE_BYTES` in `AvatarUpload.tsx`.
const IMAGE_MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const IMAGE_WEBP_QUALITY = CAMPAIGN_IMAGE_WEBP_QUALITY / 100;

/** Pulsante toolbar che carica un'immagine da file via UploadThing (`richTextImageUploader` o `supportAttachmentUploader`, T-0xx), alternativa a `UrlPopoverButton` per chi non ha un URL già pronto. Mostrato solo quando `campaignSlug` è definito o l'endpoint è `supportAttachmentUploader` (vedi `IFieldRichText`/il gate in `FieldRichText`). */
const ImageUploadButton = ({
  editor,
  campaignSlug,
  uploadEndpoint,
}: {
  editor: Editor;
  campaignSlug?: string;
  uploadEndpoint: "richTextImageUploader" | "supportAttachmentUploader";
}) => {
  const { showToast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [converting, setConverting] = React.useState(false);

  const { startUpload, isUploading } = useUploadThing(uploadEndpoint, {
    onClientUploadComplete: res => {
      const url = res?.[0]?.serverData?.url;
      if (!url) return;
      editor.chain().focus().setImage({ src: url }).run();
    },
    onUploadError: error => {
      showToast({
        variant: "error",
        message: error.message || "Errore durante il caricamento",
      });
    },
  });

  const busy = isUploading || converting;

  const handleFileChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // consente di riselezionare lo stesso file in seguito
      event.target.value = "";
      if (!file) return;

      if (file.size > IMAGE_MAX_SIZE_BYTES) {
        showToast({
          variant: "error",
          message: "Immagine troppo grande (massimo 4MB)",
        });
        return;
      }

      let toUpload = file;
      if (file.type !== "image/webp") {
        setConverting(true);
        try {
          toUpload = await convertImageFileToWebp(file, IMAGE_WEBP_QUALITY);
        } finally {
          setConverting(false);
        }
      }

      if (toUpload.size > IMAGE_MAX_SIZE_BYTES) {
        showToast({
          variant: "error",
          message: "Immagine troppo grande (massimo 4MB)",
        });
        return;
      }

      // `supportAttachmentUploader` non richiede `campaignSlug` (input Zod
      // vuoto, vedi `supportAttachmentUploadInputSchema`): passato solo per
      // `richTextImageUploader`, che invece lo richiede sempre (garantito
      // dal gate in `FieldRichText`, mai `undefined` in quel ramo).
      await startUpload(
        [toUpload],
        uploadEndpoint === "supportAttachmentUploader"
          ? {}
          : { campaignSlug: campaignSlug as string }
      );
    },
    [campaignSlug, uploadEndpoint, showToast, startUpload]
  );

  return (
    <>
      <BtnBase
        tooltip="Carica immagine"
        disabled={busy}
        onClick={() => fileInputRef.current?.click()}
        className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-transparent transition-colors hover:border-primary"
      >
        {busy ? (
          <CircularProgress size={13} />
        ) : (
          <Icon className="text-[14px] text-inherit" children="upload" />
        )}
      </BtnBase>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </>
  );
};

const EMOJI_SEARCH_RESULT_LIMIT = 100;

const popularEmojis: EmojiItem[] = RICH_TEXT_EMOJI_SHORTCODES.map(shortcode =>
  shortcodeToEmoji(shortcode, gitHubEmojis)
).filter((item): item is EmojiItem => !!item?.emoji);

const searchEmojis = (query: string): EmojiItem[] => {
  const search = query.trim().toLowerCase();
  if (!search) return popularEmojis;

  return gitHubEmojis
    .filter(
      item =>
        item.shortcodes.some(code => code.toLowerCase().includes(search)) ||
        item.tags?.some(tag => tag.toLowerCase().includes(search))
    )
    .slice(0, EMOJI_SEARCH_RESULT_LIMIT);
};

const EmojiPickerButton = ({ editor }: { editor: Editor }) => {
  const [anchorEl, setAnchorEl] = React.useState<HTMLDivElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const items = React.useMemo(() => searchEmojis(query), [query]);

  return (
    <>
      <BtnBase
        ref={setAnchorEl}
        tooltip="Emoji"
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-transparent transition-colors hover:border-primary"
      >
        <Icon className="text-[14px] text-inherit" children="emoji_emotions" />
      </BtnBase>
      <Popover open={open} anchorEl={anchorEl} onClose={() => setOpen(false)}>
        <div className="flex w-56 flex-col gap-1.5 p-2">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Cerca emoji..."
            className="h-7 rounded border border-border bg-bg px-2 text-sm text-fg outline-none focus:border-primary"
          />
          <div className="grid max-h-48 grid-cols-6 gap-1 overflow-y-auto">
            {items.length === 0 && (
              <p className="col-span-6 py-2 text-center text-xs text-muted-fg">
                Nessuna emoji trovata
              </p>
            )}
            {items.map(item => (
              <BtnBase
                key={item.name}
                tooltip={`:${item.shortcodes[0]}:`}
                onClick={() => {
                  editor.chain().focus().setEmoji(item.shortcodes[0]).run();
                  setOpen(false);
                }}
                className="flex h-8 w-8 items-center justify-center rounded text-lg hover:bg-muted-bg"
              >
                {item.emoji}
              </BtnBase>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
};

/** Editor di testo arricchito (bold, italic, titolo, citazione, codice, elenco, link, immagini, emoji, colore). Produce HTML come stringa. */
const FieldRichText = ({
  className,
  style,
  label,
  labelIcon,
  labelMandatory,
  icon,
  iconClassName,
  iconStyle,
  value = "",
  onChange = () => null,
  placeholder = "Scrivi...",
  readOnly,
  disabled,
  autoFocus = false,
  minHeight = 140,
  campaignSlug,
  uploadEndpoint = "richTextImageUploader",
}: IFieldRichText) => {
  const isInternalUpdate = React.useRef(false);

  const editable = !disabled && !readOnly;

  const editor = useEditor({
    editable,
    autofocus: autoFocus,
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        bulletList: { HTMLAttributes: { class: "list-disc pl-6" } },
        blockquote: {
          HTMLAttributes: {
            class: "border-l-2 border-border pl-3 italic text-muted-fg",
          },
        },
        codeBlock: {
          HTMLAttributes: {
            class:
              "rounded bg-muted-bg p-2 font-mono text-[13px] text-fg overflow-x-auto",
          },
        },
        horizontalRule: {
          HTMLAttributes: { class: "my-2 border-t border-border" },
        },
        link: {
          HTMLAttributes: {
            class: "text-primary underline underline-offset-2",
            rel: "noopener noreferrer nofollow",
            target: "_blank",
          },
        },
      }),
      TextStyle,
      Color,
      Image.configure({
        HTMLAttributes: { class: "my-2 max-w-full rounded" },
      }),
      Emoji.configure({
        emojis: gitHubEmojis,
        enableEmoticons: true,
        suggestion: {
          items: emojiSuggestionItems,
          render: renderEmojiSuggestion,
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor: updatedEditor }) => {
      isInternalUpdate.current = true;
      onChange(updatedEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[var(--rte-min-height)] px-3 py-2 text-sm text-fg outline-none cursor-text select-text",
          "[&_p]:m-0 [&_p]:leading-relaxed",
          "[&_h2]:m-0 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:leading-snug",
          "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-6",
          "[&_li]:my-0.5",
          "[&_.is-editor-empty:first-child::before]:pointer-events-none",
          "[&_.is-editor-empty:first-child::before]:float-left",
          "[&_.is-editor-empty:first-child::before]:h-0",
          "[&_.is-editor-empty:first-child::before]:text-muted-fg",
          "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
        ),
      },
    },
  });

  // Riallinea il contenuto quando `value` cambia dall'esterno (es. reset del form)
  React.useEffect(() => {
    if (!editor) return;

    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }

    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [value, editor]);

  React.useEffect(() => {
    // `setEditable` emette un evento "update" di default: passare `false`
    // evita che scatti `onUpdate` (che marca `isInternalUpdate`), altrimenti
    // il prossimo cambio esterno di `value` verrebbe scambiato per una
    // modifica interna e ignorato (mancato refresh dopo il salvataggio).
    editor?.setEditable(editable, false);
  }, [editable, editor]);

  const activeColor = editor?.getAttributes("textStyle").color ?? null;

  const setColor = React.useCallback(
    (colorValue: string | null) => {
      if (!editor) return;

      if (colorValue === null) {
        editor.chain().focus().unsetColor().run();
      } else {
        editor.chain().focus().setColor(colorValue).run();
      }
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <Field
      style={
        {
          ...style,
          "--rte-min-height": `${minHeight}px`,
        } as React.CSSProperties
      }
      label={label}
      labelIcon={labelIcon}
      labelMandatory={labelMandatory}
      icon={icon}
      iconClassName={iconClassName}
      iconStyle={iconStyle}
      className={cn(
        "flex-col items-stretch gap-0 px-0 py-0 min-h-0",
        className
      )}
      readOnly={readOnly}
      disabled={disabled}
    >
      {editable && (
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
          <ToolbarButton
            tooltip="Grassetto"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Icon className="text-[14px] text-inherit" children="text_bold" />
          </ToolbarButton>
          <ToolbarButton
            tooltip="Corsivo"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Icon className="text-[14px] text-inherit" children="text_italic" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-border" />

          <ToolbarButton
            tooltip="Titolo"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Icon className="text-[14px] text-inherit" children="heading" />
          </ToolbarButton>
          <ToolbarButton
            tooltip="Citazione"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Icon className="text-[14px] text-inherit" children="block_quote" />
          </ToolbarButton>
          <ToolbarButton
            tooltip="Blocco di codice"
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <Icon className="text-[14px] text-inherit" children="code" />
          </ToolbarButton>
          <ToolbarButton
            tooltip="Elenco puntato"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <Icon className="text-[14px] text-inherit" children="list" />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-border" />

          <EmojiPickerButton editor={editor} />

          <UrlPopoverButton
            tooltip="Link"
            icon={<Icon className="text-[14px] text-inherit" children="link" />}
            active={editor.isActive("link")}
            placeholder="https://esempio.it"
            initialValue={(editor.getAttributes("link").href as string) ?? ""}
            submitLabel="Applica link"
            onSubmit={url =>
              editor
                .chain()
                .focus()
                .extendMarkRange("link")
                .setLink({ href: url })
                .run()
            }
            onRemove={
              editor.isActive("link")
                ? () => editor.chain().focus().unsetLink().run()
                : undefined
            }
          />
          <UrlPopoverButton
            tooltip="Immagine da URL"
            icon={
              <Icon
                className="text-[14px] text-inherit"
                children="add_photo_alternate"
              />
            }
            placeholder="https://esempio.it/immagine.png"
            submitLabel="Inserisci immagine"
            onSubmit={url =>
              editor.chain().focus().setImage({ src: url }).run()
            }
          />
          {(campaignSlug || uploadEndpoint === "supportAttachmentUploader") && (
            <ImageUploadButton
              editor={editor}
              campaignSlug={campaignSlug}
              uploadEndpoint={uploadEndpoint}
            />
          )}
          <ToolbarButton
            tooltip="Inserisci separatore"
            onClick={() => editor.chain().focus().setHorizontalRule().run()}
          >
            <Icon
              className="text-[14px] text-inherit"
              children="horizontal_rule"
            />
          </ToolbarButton>

          <div className="mx-1 h-5 w-px bg-border" />

          <ColorPickerButton activeColor={activeColor} onSelect={setColor} />
        </div>
      )}

      <EditorContent className="flex-1 overflow-y-auto" editor={editor} />
    </Field>
  );
};

export default FieldRichText;
