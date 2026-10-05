"use client";

import * as React from "react";
import Avatar, { IAvatar } from "../_core/Avatar";
import getInitials from "@/lib/utils/getInitials";
import stringToColor from "@/lib/utils/stringToColor";
import { cn } from "@/lib/utils";

/**
 * Avatar di un utente.
 * - Mostra l'immagine se `src` è impostato.
 * - Altrimenti mostra le iniziali su uno sfondo il cui colore è derivato
 *   matematicamente dal nome: univoco per ogni utente e sempre uguale.
 */
const AvatarUser = React.forwardRef<HTMLDivElement, IAvatar>(
  ({ text, src, icon, style, textClassName, circle, ...rest }, ref) => {
    const displayName = text ?? "";
    const initials = getInitials(displayName) || "";
    const hasImage = !!src;

    return (
      <Avatar
        ref={ref}
        src={src ?? undefined}
        text={initials}
        icon={icon}
        circle={circle}
        style={
          hasImage
            ? style
            : { backgroundColor: stringToColor(displayName), ...style }
        }
        textClassName={cn(!hasImage && "text-white", textClassName)}
        {...rest}
      />
    );
  }
);

AvatarUser.displayName = "AvatarUser";

export default AvatarUser;
