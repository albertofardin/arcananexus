"use client";

import * as React from "react";
import Toolbar from "@/components/_core/Toolbar";
import Btn from "@/components/_core/Btn";
import Text from "@/components/_core/Text";

const FormCard = ({
  title,
  goBack,
  onSubmit,
  children,
}: {
  title?: string;
  goBack?: () => void;
  onSubmit?: () => void;
  children: React.ReactNode;
}) => {
  const titleId = React.useId();

  const handleSubmit = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onSubmit?.();
    },
    [onSubmit]
  );

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={title ? titleId : undefined}
      className="
        relative w-full self-center overflow-x-hidden overflow-y-auto
      "
    >
      <div
        className="
          relative mx-auto flex h-fit w-full max-w-[500px] flex-1 flex-col items-center
          overflow-x-hidden overflow-y-auto
          px-6 pt-10 pb-5
          sm:px-10
        "
      >
        {!goBack ? null : (
          <Toolbar className="mb-5 justify-center w-stretch">
            <Btn
              className="absolute top-0 bottom-0 left-0 h-fit my-auto"
              onClick={goBack}
              icon="arrow_back"
              tooltip="Torna al login"
            />
            <Text
              size={5}
              weight="bolder"
              className="font-front"
              style={{ textTransform: "uppercase" }}
              children={title || "-TITLE-"}
            />
          </Toolbar>
        )}

        {children}
      </div>
    </form>
  );
};

export default FormCard;
