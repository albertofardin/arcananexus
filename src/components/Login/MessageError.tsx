import Text from "../_core/Text";
import { Initialize } from "./utils";
import getErrorMsg from "@/lib/utils/getErrorMsg";

export const getErrors = async (err): Promise<string[]> => {
  if (Array.isArray(err)) return err;
  const msg = await getErrorMsg(err);
  return [msg];
};

interface IMessageError {
  init: Initialize;
  messagesSucc: string[];
  messagesFail: string[];
}

const MessageError = ({ init, messagesSucc, messagesFail }: IMessageError) => {
  if (init === Initialize.SUCC) {
    return messagesSucc.map((p, i) => (
      <Text key={i} className="text-center text-succ" children={p} />
    ));
  }
  if (init === Initialize.FAIL) {
    return messagesFail.map((p, i) => (
      <Text key={i} className="text-center text-fail" children={p} />
    ));
  }
  return null;
};

const MessageErrorWithMargin = (p: IMessageError) => {
  const isError = p.init === Initialize.FAIL;
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className="flex w-full flex-col items-center gap-1 px-2 py-2"
    >
      <MessageError {...p} />
    </div>
  );
};

export default MessageErrorWithMargin;
