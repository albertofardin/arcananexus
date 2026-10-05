import FieldRowSkeleton from "./FieldRowSkeleton";
import { FormData, RequiredFieldKey } from "./types";
import FieldText from "@/components/_core/FieldText";
import FieldDate from "@/components/_core/FieldDate";
import Card from "@/components/_core/Card/Card";
import Divider from "@/components/_core/Divider";
import HeroSection from "@/components/HeroSection";
import { cn } from "@/lib/utils";

const FIELD_ERROR_CLASSNAME = "border-fail focus-within:border-fail";

export interface IPersonalDataCard {
  loading: boolean;
  form: FormData;
  set: (field: keyof FormData, value: string) => void;
  someCoreFilled: boolean;
  isMinor: boolean;
  fieldError: (field: RequiredFieldKey) => boolean;
}

const PersonalDataCard = ({
  loading,
  form,
  set,
  someCoreFilled,
  isMinor,
  fieldError,
}: IPersonalDataCard) => {
  return (
    <Card className="flex-col items-stretch p-3 flex-1 gap-3 justify-start">
      <HeroSection
        icon="profile"
        title="Dati Anagrafici"
        subtitle="Informazioni personali richieste per le iscrizioni agli eventi"
      />
      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <FieldRowSkeleton key={i} />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <FieldText
              label="Nome"
              labelMandatory={someCoreFilled}
              placeholder="Es. Mario"
              icon="person"
              error={fieldError("firstName")}
              className={
                fieldError("firstName") ? FIELD_ERROR_CLASSNAME : undefined
              }
              value={form.firstName}
              onChange={v => set("firstName", v)}
            />
            <FieldText
              label="Cognome"
              labelMandatory={someCoreFilled}
              placeholder="Es. Rossi"
              icon="person"
              error={fieldError("lastName")}
              className={
                fieldError("lastName") ? FIELD_ERROR_CLASSNAME : undefined
              }
              value={form.lastName}
              onChange={v => set("lastName", v)}
            />
            <FieldDate
              label="Data di nascita"
              labelMandatory={someCoreFilled}
              error={fieldError("dateOfBirth")}
              className={
                fieldError("dateOfBirth") ? FIELD_ERROR_CLASSNAME : undefined
              }
              value={form.dateOfBirth}
              onChange={v => set("dateOfBirth", v)}
            />
            <FieldText
              label="Luogo di nascita"
              labelMandatory={someCoreFilled}
              placeholder="Es. Milano"
              icon="location"
              error={fieldError("placeOfBirth")}
              className={
                fieldError("placeOfBirth") ? FIELD_ERROR_CLASSNAME : undefined
              }
              value={form.placeOfBirth}
              onChange={v => set("placeOfBirth", v)}
            />
            <FieldText
              label="Telefono"
              placeholder="Es. +39 333 1234567"
              icon="call"
              inputType="tel"
              value={form.phone}
              onChange={v => set("phone", v)}
            />
            <FieldText
              label="Nazionalità"
              placeholder="Es. Italiana"
              icon="globe"
              value={form.nationality}
              onChange={v => set("nationality", v)}
            />
            <FieldText
              className={cn(
                "sm:col-span-2",
                fieldError("address") && FIELD_ERROR_CLASSNAME
              )}
              label="Indirizzo"
              labelMandatory={someCoreFilled}
              placeholder="Es. Via Roma 1, 20100 Milano"
              icon="home"
              error={fieldError("address")}
              value={form.address}
              onChange={v => set("address", v)}
            />
            <FieldText
              className={cn(
                "sm:col-span-2",
                fieldError("ssn") && FIELD_ERROR_CLASSNAME
              )}
              label="Codice Fiscale"
              labelMandatory={someCoreFilled}
              placeholder="Es. RSSMRA80A01H501Z"
              icon="receipt_long"
              error={fieldError("ssn")}
              value={form.ssn}
              onChange={v => set("ssn", v.toUpperCase())}
            />
          </div>

          {isMinor && (
            <>
              <Divider />
              <HeroSection
                icon="police_badge"
                title="Genitore o tutore legale"
                subtitle="Dati obbligatori per i partecipanti minorenni"
                color="#d97706"
              />
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <FieldText
                  className={cn(
                    "sm:col-span-2",
                    fieldError("guardianName") && FIELD_ERROR_CLASSNAME
                  )}
                  label="Nome e cognome del tutore"
                  labelMandatory
                  placeholder="Es. Giuseppe Rossi"
                  icon="supervisor_account"
                  error={fieldError("guardianName")}
                  value={form.guardianName}
                  onChange={v => set("guardianName", v)}
                />
                <FieldText
                  label="Telefono del tutore"
                  labelMandatory
                  placeholder="Es. +39 333 1234567"
                  icon="call"
                  inputType="tel"
                  error={fieldError("guardianPhone")}
                  className={
                    fieldError("guardianPhone")
                      ? FIELD_ERROR_CLASSNAME
                      : undefined
                  }
                  value={form.guardianPhone}
                  onChange={v => set("guardianPhone", v)}
                />
                <FieldText
                  label="Email del tutore"
                  placeholder="tutore@email.com"
                  icon="email"
                  inputType="email"
                  value={form.guardianEmail}
                  onChange={v => set("guardianEmail", v)}
                />
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
};

export default PersonalDataCard;
