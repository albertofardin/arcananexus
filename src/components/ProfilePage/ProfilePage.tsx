"use client";

import * as React from "react";
import Badge from "../_core/Badge";
import ModalChangePassword from "./ModalChangePassword";
import ModalChangeEmail from "./ModalChangeEmail";
import PersonalDataCard from "./PersonalDataCard";
import FieldRowSkeleton from "./FieldRowSkeleton";
import { CORE_FIELDS, FormData, RequiredFieldKey } from "./types";
import FieldText from "@/components/_core/FieldText";
import Field from "@/components/_core/Field";
import Text from "@/components/_core/Text";
import Card from "@/components/_core/Card/Card";
import HeroPage from "@/components/HeroPage";
import HeroSection from "@/components/HeroSection";
import SaveBar from "@/components/SaveBar";
import HeroBanner from "@/components/HeroBanner";
import AvatarUpload from "@/components/AvatarUpload";
import { useToast } from "@/components/_core/Toast";
import { useSession } from "@/lib/auth-client";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { cn } from "@/lib/utils";

const getAge = (isoDate: string): number | null => {
  if (!isoDate) return null;
  const birth = new Date(isoDate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const emptyForm: FormData = {
  name: "",
  email: "",
  emailVerified: false,
  emailNotificationsEnabled: true,
  image: "",
  firstName: "",
  lastName: "",
  ssn: "",
  address: "",
  dateOfBirth: "",
  placeOfBirth: "",
  phone: "",
  nationality: "",
  guardianName: "",
  guardianPhone: "",
  guardianEmail: "",
};

const FIELD_LABELS: Partial<Record<keyof FormData, string>> = {
  firstName: "Nome",
  lastName: "Cognome",
  ssn: "Codice Fiscale",
  address: "Indirizzo",
  dateOfBirth: "Data di nascita",
  placeOfBirth: "Luogo di nascita",
  guardianName: "Nome e cognome del tutore",
  guardianPhone: "Telefono del tutore",
};

export default function ProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;
  const { showToast } = useToast();

  const [form, setForm] = React.useState<FormData>(emptyForm);
  const [saved, setSaved] = React.useState<FormData>(emptyForm);
  const [saving, setIsSaving] = React.useState(false);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [attemptedSave, setAttemptedSave] = React.useState(false);
  const [changePwdOpen, setChangePwdOpen] = React.useState(false);
  const [changeEmailOpen, setChangeEmailOpen] = React.useState(false);

  const {
    status: pushStatus,
    error: pushError,
    subscribe: enablePush,
    unsubscribe: disablePush,
  } = usePushNotifications();

  const [emailNotifSaving, setEmailNotifSaving] = React.useState(false);

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  React.useEffect(() => {
    if (!user) return;

    const seeded: FormData = {
      ...emptyForm,
      name: user.name ?? "",
      email: user.email ?? "",
      emailVerified: user.emailVerified ?? false,
      image: user.image ?? "",
    };
    setForm(seeded);
    setSaved(seeded);

    fetch("/api/profile")
      .then(r => r.json())
      .then(data => {
        const next: FormData = {
          ...emptyForm,
          name: data.user?.name ?? user.name ?? "",
          email: data.user?.email ?? user.email ?? "",
          emailVerified:
            data.user?.emailVerified ?? user.emailVerified ?? false,
          emailNotificationsEnabled:
            data.user?.emailNotificationsEnabled ?? true,
          image: data.user?.image ?? user.image ?? "",
          firstName: data.personalData?.firstName ?? "",
          lastName: data.personalData?.lastName ?? "",
          ssn: data.personalData?.ssn ?? "",
          address: data.personalData?.address ?? "",
          dateOfBirth: data.personalData?.dateOfBirth
            ? new Date(data.personalData.dateOfBirth)
                .toISOString()
                .split("T")[0]
            : "",
          placeOfBirth: data.personalData?.placeOfBirth ?? "",
          phone: data.personalData?.phone ?? "",
          nationality: data.personalData?.nationality ?? "",
          guardianName: data.personalData?.guardianName ?? "",
          guardianPhone: data.personalData?.guardianPhone ?? "",
          guardianEmail: data.personalData?.guardianEmail ?? "",
        };
        setForm(next);
        setSaved(next);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  const set = React.useCallback((field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  }, []);

  const onAvatarChange = React.useCallback((image: string | null) => {
    setForm(prev => ({ ...prev, image }));
    setSaved(prev => ({ ...prev, image }));
  }, []);

  // Toggle immediato (stesso pattern di enablePush/disablePush sopra): non
  // passa dal form/SaveBar principale, un click salva subito la preferenza.
  const toggleEmailNotifications = React.useCallback(async () => {
    const next = !form.emailNotificationsEnabled;
    setEmailNotifSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotificationsEnabled: next }),
      });
      if (!res.ok) throw new Error("Salvataggio preferenza fallito");
      setForm(prev => ({ ...prev, emailNotificationsEnabled: next }));
      setSaved(prev => ({ ...prev, emailNotificationsEnabled: next }));
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: "Impossibile aggiornare la preferenza email",
      });
    } finally {
      setEmailNotifSaving(false);
    }
  }, [form.emailNotificationsEnabled, showToast]);

  const someCoreFilled = CORE_FIELDS.some(field => form[field].trim() !== "");
  const age = getAge(form.dateOfBirth);
  const isMinor = age !== null && age < 18;

  const missingFields = React.useMemo<RequiredFieldKey[]>(() => {
    const missingCore = someCoreFilled
      ? CORE_FIELDS.filter(field => !form[field].trim())
      : [];
    const missingGuardian = isMinor
      ? (["guardianName", "guardianPhone"] as const).filter(
          field => !form[field].trim()
        )
      : [];
    return [...missingCore, ...missingGuardian];
  }, [form, someCoreFilled, isMinor]);

  const fieldError = React.useCallback(
    (field: RequiredFieldKey) => attemptedSave && missingFields.includes(field),
    [attemptedSave, missingFields]
  );

  const handleSave = React.useCallback(async () => {
    if (missingFields.length > 0) {
      setAttemptedSave(true);
      showToast({
        variant: "error",
        message: `Compila i campi obbligatori mancanti: ${missingFields
          .map(field => FIELD_LABELS[field])
          .join(", ")}`,
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/profile/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Errore durante il salvataggio");
      }
      setSaved(form);
      setAttemptedSave(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      showToast({
        variant: "success",
        message: "Modifiche salvate con successo",
      });
    } catch (err) {
      console.error(err);
      showToast({
        variant: "error",
        message: err.message || "Errore durante il salvataggio",
      });
    } finally {
      setIsSaving(false);
    }
  }, [form, showToast, missingFields]);

  const handleDiscard = React.useCallback(() => {
    setForm(saved);
    setAttemptedSave(false);
  }, [saved]);

  const displayName =
    form.firstName && form.lastName
      ? `${form.firstName} ${form.lastName}`
      : form.name;
  return (
    <>
      <HeroPage
        title="Profilo"
        subtitle="Gestisci le tue informazioni personali"
      />

      <HeroBanner>
        <div
          className={cn(
            "flex flex-col items-center text-center",
            "sm:flex-row sm:text-left sm:p-3"
          )}
        >
          <div className="sm:absolute bottom-0 right-0 sm:right-3">
            {loading ? (
              <div className="h-[140px] w-[140px] rounded-full bg-white/20 animate-pulse" />
            ) : (
              <AvatarUpload
                size={140}
                endpoint="/api/profile/avatar"
                uploadInput={{ target: "user" }}
                src={form.image}
                text={displayName}
                onChange={onAvatarChange}
                circle
              />
            )}
          </div>
          <div className="flex-1 min-w-0 w-full">
            {loading ? (
              <div className="space-y-3 w-[200px] mx-auto sm:mx-0">
                {Array.from({ length: 1 }).map((_, i) => (
                  <FieldRowSkeleton key={i} />
                ))}
              </div>
            ) : (
              <>
                <Text
                  size={6}
                  weight="bolder"
                  ellipsis
                  style={{ color: "#fff" }}
                  children={displayName || "—"}
                />
                <Text
                  className="mt-1"
                  size={2}
                  ellipsis
                  style={{ color: "rgba(255,255,255,0.7)" }}
                  children={form.email || "—"}
                />
              </>
            )}
          </div>
        </div>
      </HeroBanner>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="flex-col items-stretch p-3 flex-1 gap-3 justify-start">
          <HeroSection
            icon="settings"
            title="Account"
            subtitle="Nome visualizzato e indirizzo email"
          />
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <FieldRowSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-x-4 gap-y-3">
              <FieldText
                label="Nome visualizzato"
                placeholder="Es. Mario Rossi"
                icon="person"
                value={form.name}
                onChange={v => set("name", v)}
              />
              <Field
                label="Email"
                icon="email"
                className="cursor-pointer"
                onClick={() => setChangeEmailOpen(true)}
              >
                <Text
                  ellipsis
                  className="flex-1 px-2 text-sm"
                  children={form.email || "—"}
                />
                <Badge
                  icon={form.emailVerified ? "check_circle" : "cancel"}
                  label={form.emailVerified ? "Confermata" : "Non confermata"}
                  labelPosition
                  className="absolute -top-3 right-2 sm:static"
                  color={form.emailVerified ? "var(--succ)" : "var(--fail)"}
                />
              </Field>
              <Field
                label="Password"
                icon="lock"
                className="cursor-pointer"
                onClick={() => setChangePwdOpen(true)}
              >
                <Text className="flex-1 px-2 text-sm" children="***********" />
              </Field>
            </div>
          )}
        </Card>

        <PersonalDataCard
          loading={loading}
          form={form}
          set={set}
          someCoreFilled={someCoreFilled}
          isMinor={isMinor}
          fieldError={fieldError}
        />

        <Card className="flex-col items-stretch p-3 flex-1 gap-3 justify-start">
          <HeroSection
            icon="bell"
            title="Notifiche"
            subtitle="Come vuoi essere avvisato di missive, downtime e revisioni"
          />
          <div className="flex flex-col gap-3">
            {pushStatus !== "unsupported" && pushStatus !== "checking" && (
              <Card
                className="rounded px-3 py-2"
                onClick={pushStatus === "subscribed" ? disablePush : enablePush}
              >
                <div className="min-w-0 flex-1">
                  <Text weight="bolder" children="Notifiche push" />
                  <Text
                    size={0}
                    className="text-muted-fg"
                    children={
                      pushStatus === "subscribed"
                        ? "Attive su questo dispositivo"
                        : "Ricevi le notifiche anche a schermo spento, come una vera app"
                    }
                  />
                  {pushError && (
                    <Text size={0} className="text-fail" children={pushError} />
                  )}
                </div>

                <Badge
                  className="w-[92px]"
                  icon={
                    pushStatus === "subscribed" ? "toggle_on" : "toggle_off"
                  }
                  label={pushStatus === "subscribed" ? "Attiva" : "Disattiva"}
                  labelPosition
                  color={
                    pushStatus === "subscribed" ? "var(--succ)" : "var(--fail)"
                  }
                />
              </Card>
            )}

            <Card
              className={cn(
                "rounded px-3 py-2",
                emailNotifSaving && "opacity-50"
              )}
              onClick={emailNotifSaving ? undefined : toggleEmailNotifications}
            >
              <div className="min-w-0 flex-1">
                <Text weight="bolder" children="Notifiche via email" />
                <Text
                  size={0}
                  className="text-muted-fg"
                  children={
                    form.emailNotificationsEnabled
                      ? "Ricevi un'email per missive, downtime e revisioni"
                      : "Non riceverai più email per le notifiche"
                  }
                />
              </div>
              <Badge
                className="w-[92px]"
                icon={
                  form.emailNotificationsEnabled ? "toggle_on" : "toggle_off"
                }
                label={form.emailNotificationsEnabled ? "Attiva" : "Disattiva"}
                labelPosition
                color={
                  form.emailNotificationsEnabled ? "var(--succ)" : "var(--fail)"
                }
              />
            </Card>
          </div>
        </Card>
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        saved={saveSuccess}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
      <ModalChangePassword
        open={changePwdOpen}
        onClose={() => setChangePwdOpen(false)}
      />
      <ModalChangeEmail
        open={changeEmailOpen}
        currentEmail={form.email}
        onClose={() => setChangeEmailOpen(false)}
      />
    </>
  );
}
