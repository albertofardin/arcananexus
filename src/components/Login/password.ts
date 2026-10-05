export interface IPwdPolicy {
  minimumLength: number;
  maximumLength?: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireNumbers: boolean;
  requireSymbols: boolean;
}

export const PWD_POLICY: IPwdPolicy = {
  minimumLength: 8,
  maximumLength: 200,
  requireLowercase: false,
  requireUppercase: false,
  requireNumbers: true,
  requireSymbols: false,
};

export interface IPwdValidationResult {
  valid: boolean;
  validMinLength: boolean;
  validMaxLength: boolean;
  validLowercase: boolean;
  validUppercase: boolean;
  validNumbers: boolean;
  validSymbols: boolean;
}

const SPECIAL_CHARS = [
  "^",
  "$",
  "*",
  ".",
  "[",
  "]",
  "{",
  "}",
  "(",
  ")",
  "?",
  "!",
  "@",
  "#",
  "%",
  "&",
  ">",
  "<",
  ":",
  ";",
  "|",
  "_",
  "=",
  "+",
  "-",
];

const haveValidMinLength = (
  required: boolean,
  pass: string,
  n: number
): boolean => {
  return !required ? true : pass.length >= n;
};
const haveValidMaxLength = (
  required: boolean,
  pass: string,
  n: number
): boolean => {
  return !required ? true : pass.length <= n;
};
const haveValidLowercase = (required: boolean, pass: string): boolean => {
  return !required ? true : /[a-z]/.test(pass);
};
const haveValidUppercase = (required: boolean, pass: string): boolean => {
  return !required ? true : /[A-Z]/.test(pass);
};
const haveValidNumbers = (required: boolean, pass: string): boolean => {
  return !required ? true : /[0-9]/.test(pass);
};
const haveValidSymbols = (required: boolean, pass: string): boolean => {
  return !required ? true : SPECIAL_CHARS.some(s => pass.indexOf(s) > -1);
};

export const validatePassword = ({
  password = "",
  pwdPolicy = PWD_POLICY,
  required = true,
}: {
  password?: string;
  pwdPolicy?: IPwdPolicy;
  required?: boolean;
}): IPwdValidationResult => {
  if (password !== null && password.length > 0) {
    const validMinLength = haveValidMinLength(
      !!pwdPolicy.minimumLength,
      password,
      pwdPolicy.minimumLength
    );
    const validMaxLength = haveValidMaxLength(
      !!pwdPolicy.maximumLength,
      password,
      pwdPolicy.maximumLength
    );
    const validLowercase = haveValidLowercase(
      pwdPolicy.requireLowercase,
      password
    );
    const validUppercase = haveValidUppercase(
      pwdPolicy.requireUppercase,
      password
    );
    const validNumbers = haveValidNumbers(pwdPolicy.requireNumbers, password);
    const validSymbols = haveValidSymbols(pwdPolicy.requireSymbols, password);

    return {
      validMinLength,
      validMaxLength,
      validLowercase,
      validUppercase,
      validNumbers,
      validSymbols,
      valid:
        validMinLength &&
        validMaxLength &&
        validLowercase &&
        validUppercase &&
        validNumbers &&
        validSymbols,
    };
  } else {
    return {
      validMinLength: false,
      validMaxLength: false,
      validLowercase: false,
      validUppercase: false,
      validNumbers: false,
      validSymbols: false,
      valid: !required,
    };
  }
};

export const getPwdTooltip = ({
  pwdPolicy,
  pwdValidationResult,
}: {
  pwdPolicy: IPwdPolicy;
  pwdValidationResult: IPwdValidationResult;
}): string[] => {
  if (pwdValidationResult?.valid ?? true) {
    return [];
  }
  return [
    addValidationLabel(
      !!pwdPolicy.minimumLength,
      pwdValidationResult.validMinLength,
      `Lunghezza minima password di ${pwdPolicy.minimumLength} caratteri`
    ),
    addValidationLabel(
      !!pwdPolicy.maximumLength,
      pwdValidationResult.validMaxLength,
      `Lunghezza massima password di ${pwdPolicy.maximumLength} caratteri`
    ),
    addValidationLabel(
      !!pwdPolicy.requireLowercase,
      pwdValidationResult.validLowercase,
      "Password deve contenere almeno una lettera minuscola"
    ),
    addValidationLabel(
      !!pwdPolicy.requireUppercase,
      pwdValidationResult.validUppercase,
      "Password deve contenere almeno una lettera maiuscola"
    ),
    addValidationLabel(
      !!pwdPolicy.requireNumbers,
      pwdValidationResult.validNumbers,
      "Password deve contenere almeno un numero"
    ),
    addValidationLabel(
      !!pwdPolicy.requireSymbols,
      pwdValidationResult.validSymbols,
      "Password deve contenere almeno un simbolo"
    ),
  ];
};

export const addValidationLabel = (
  require: boolean,
  valid: boolean,
  text: string
): string => {
  if (!require) return "";
  return (valid ? "✅" : "❌") + " " + text;
};
