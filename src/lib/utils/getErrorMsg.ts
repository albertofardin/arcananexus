const ERROR_GENERIC = "Qualcosa è andato storto, riprova";

const getErrorMsg = async (err, t = ERROR_GENERIC): Promise<string> => {
  try {
    if (typeof err === "string") return err;
    if (typeof err?.message === "string") return err.message;
    if (typeof err?.error === "string") return err.error;
    const errJson = await err.response.json();
    const errText = errJson.message || errJson.error;
    return String(errText || t);
  } catch {
    return t;
  }
};

export default getErrorMsg;
