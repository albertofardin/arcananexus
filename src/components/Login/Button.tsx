"use client";

import * as React from "react";
import Btn from "../_core/Btn";
import CircularProgress from "../_core/CircularProgress";

interface IButton {
  color?: string;
  label: string;
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const Button = ({ color, label, loading, disabled, onClick }: IButton) => {
  return (
    <Btn
      variant="bold"
      color={color}
      label={loading ? <CircularProgress size={22} color="#fff" /> : label}
      disabled={disabled || loading}
      onClick={onClick}
      className="
        mt-[25px]
        h-[50px] min-h-[50px] max-h-[50px]
        w-[300px] max-w-full
        p-0 text-center
        w-[100%]
      "
    />
  );
};

export default Button;
