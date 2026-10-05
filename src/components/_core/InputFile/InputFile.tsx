import * as React from "react";

export interface IInputFile {
  acceptFiles?: string;
  directory?: boolean;
  multiple?: boolean;
  onChangeInput: (event: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

const InputFile = ({
  acceptFiles = "*",
  directory = false,
  multiple = false,
  onChangeInput,
  disabled,
}: IInputFile) => {
  const onClick = React.useCallback(
    (event: React.MouseEvent<HTMLInputElement>) => {
      event.stopPropagation();
      // permette di riselezionare lo stesso file due volte di fila
      event.currentTarget.value = "";
    },
    []
  );

  const onDrop = React.useCallback((event: React.DragEvent) => {
    // disabilito il drop dei file direttamente nell'input
    event.preventDefault();
  }, []);

  if (disabled) return null;

  return (
    <input
      title=""
      type="file"
      accept={acceptFiles}
      {...(directory ? { directory: "", webkitdirectory: "" } : {})}
      multiple={multiple}
      onClick={onClick}
      onDrop={onDrop}
      onChange={onChangeInput}
      className="absolute inset-0 z-[1] m-auto h-full w-full cursor-pointer opacity-0 outline-none file:cursor-pointer"
    />
  );
};

export default InputFile;
