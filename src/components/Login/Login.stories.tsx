import { fn } from "storybook/test";
import Login, {
  ILogin,
  FormChoosePassword,
  IFormChoosePassword,
  FormDemandPassword,
  IFormDemandPassword,
  FormForgotPassword,
  IFormForgotPassword,
  FormRegistration,
  IFormRegistration,
} from ".";

const argsLogin: ILogin = {
  onLogin: async p => {
    await new Promise(resolve => setTimeout(resolve, 500));
    fn()("onLogin", p);
    return {
      success: false,
      message: [
        "la mail contiene caratteri non consentiti",
        "company contiene caratteri numerici",
      ],
    };
  },
  onRegistration: async p => {
    await new Promise(resolve => setTimeout(resolve, 500));
    fn()("onRegistration", p);
    throw new Error("Errore non gestito");
  },
  onDemandPassword: async p => {
    await new Promise(resolve => setTimeout(resolve, 500));
    fn()("onDemandPassword", p);
    throw new Error("Errore non gestito");
  },
  onChoosePassword: async p => {
    await new Promise(resolve => setTimeout(resolve, 500));
    fn()("onChoosePassword", p);
    throw new Error("Errore non gestito");
  },
};

export default {
  title: "layout/Login",
  component: Login,
};
const Story = () => <Login {...argsLogin} />;
export const Default = Story.bind({});

// FormRegistration
const argsRegistration: IFormRegistration = {
  goBack: () => {
    fn()("goBack");
  },
  onRequest: async p => {
    await new Promise(resolve => setTimeout(resolve, 500));
    fn()("onRequest", p);
    return { success: true, message: "" };
  },
};
const StoryRegistration = () => <FormRegistration {...argsRegistration} />;
export const Registration = StoryRegistration.bind({});

// FormChoosePassword
const argsChoosePassword: IFormChoosePassword = {
  onValid: p => {
    fn()("onValid", p);
  },
};
const StoryChoosePassword = () => (
  <FormChoosePassword {...argsChoosePassword} />
);
export const ChoosePassword = StoryChoosePassword.bind({});

// FormDemandPassword
const argsDemandPassword: IFormDemandPassword = {
  goBack: () => {
    fn()("goBack");
  },
  onRequest: async p => {
    await new Promise(resolve => setTimeout(resolve, 500));
    fn()("onRequest", p);
    return { success: true, message: "" };
  },
};
const StoryDemandPassword = () => (
  <FormDemandPassword {...argsDemandPassword} />
);
export const DemandPassword = StoryDemandPassword.bind({});

// FormForgotPassword
const argsForgotPassword: IFormForgotPassword = {
  goBack: () => {
    fn()("goBack");
  },
  onRequest: async p => {
    await new Promise(resolve => setTimeout(resolve, 500));
    fn()("onRequest", p);
    return { success: true, message: "" };
  },
};
const StoryForgotPassword = () => (
  <FormForgotPassword {...argsForgotPassword} />
);
export const ForgotPassword = StoryForgotPassword.bind({});
