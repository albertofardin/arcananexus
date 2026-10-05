"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import Icon from "../Icon";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      [
        "fixed inset-0 z-50",
        "bg-black/40",
        "backdrop-blur-[2px]",
        "data-[state=open]:animate-in",
        "data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0",
        "data-[state=open]:fade-in-0",
      ],
      className
    )}
    {...props}
  />
));

DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

interface DialogContentProps extends React.ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> {
  transparentOverlay?: boolean;

  hideCloseButton?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(
  (
    { className, children, transparentOverlay, hideCloseButton, ...props },
    ref
  ) => (
    <DialogPortal>
      <DialogOverlay
        className={
          transparentOverlay
            ? "pointer-events-none bg-transparent backdrop-blur-none"
            : undefined
        }
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          [
            "fixed left-[50%] top-[50%]",
            "z-50",
            "w-fit",
            "max-w-[calc(100vw-30px)]",
            "translate-x-[-50%]",
            "translate-y-[-50%]",
            "overflow-hidden",
            "border",
            "bg-card",
            "shadow-xl",
            "duration-200",
            "data-[state=open]:animate-in",
            "data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0",
            "data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95",
            "data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2",
            "data-[state=closed]:slide-out-to-top-[48%]",
            "data-[state=open]:slide-in-from-left-1/2",
            "data-[state=open]:slide-in-from-top-[48%]",
            "rounded ring-0",
            "outline-none",
          ],
          className
        )}
        {...props}
      >
        {children}

        {!hideCloseButton ? (
          <DialogPrimitive.Close
            className={cn([
              "absolute right-4 top-4",
              "rounded",
              "opacity-70",
              "transition-opacity",
              "hover:opacity-100",
              "ring-0",
              "outline-none",
              "focus:outline-none",
              "disabled:pointer-events-none",
            ])}
          >
            <Icon className="text-[16px] text-inherit" children="close" />

            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);

DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-row gap-3 items-center",
      "px-3 pt-3 pb-1",
      "relative box-border",
      className
    )}
    {...props}
  />
);

DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-row flex-wrap items-center",
      "justify-end gap-2",
      "px-3 py-2",
      className
    )}
    {...props}
  />
);

DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      ["text-lg", "font-bold", "leading-none", "tracking-tight"],
      className
    )}
    {...props}
  />
));

DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn(["text-sm", "text-muted-fg"], className)}
    {...props}
  />
));

DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
