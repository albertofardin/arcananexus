import { NextRequest, NextResponse } from "next/server";
import { APIError } from "better-auth/api";
import { prisma } from "@/lib/db";
import { auth, callAuthEndpoint, readAuthEndpointResponse } from "@/lib/auth";
import { getSessionContext } from "@/lib/impersonation";
import { updateProfileSchema } from "@/lib/validations/profile";
import { upsertPersonalData } from "@/lib/repositories/personalData.repository";
import { setEmailNotificationsEnabled } from "@/lib/repositories/user.repository";
import { apiError } from "@/lib/api-helpers";

export async function PUT(request: NextRequest) {
  const context = await getSessionContext(request.headers);
  if (!context) {
    return apiError(401, "Not authenticated");
  }

  const body = await request.json();
  const validation = updateProfileSchema.safeParse(body);
  if (!validation.success) {
    return apiError(400, "Invalid data", validation.error);
  }

  const {
    name,
    email,
    currentPassword,
    image,
    firstName,
    lastName,
    ssn,
    address,
    dateOfBirth,
    placeOfBirth,
    phone,
    nationality,
    guardianName,
    guardianPhone,
    guardianEmail,
    emailNotificationsEnabled,
  } = validation.data;

  const wantsEmailChange =
    email !== undefined && email !== context.activeUser.email;

  // Cambio email: equivale a cambiare le credenziali di accesso, quindi:
  // - vietato durante un'impersonificazione, altrimenti un admin potrebbe
  //   dirottare l'account del target (review T-6, MAJOR #2);
  // - richiede la conferma della password attuale, dato che
  //   `updateEmailWithoutVerification` la cambia senza alcun altro controllo
  //   (review T-6, MAJOR #2).
  if (wantsEmailChange) {
    if (context.isImpersonating) {
      return apiError(
        403,
        "Operazione non consentita durante l'impersonificazione"
      );
    }
    if (!currentPassword) {
      return apiError(
        400,
        "La password attuale è obbligatoria per cambiare l'email"
      );
    }
  }

  try {
    // Nota su atomicità: le scritture sotto toccano due sistemi distinti
    // (Better Auth per user/email, il nostro repository per PersonalData)
    // senza una transazione condivisa, quindi un fallimento a metà può
    // lasciare uno stato parzialmente salvato. Per minimizzare il rischio,
    // l'operazione più soggetta a fallire per input dell'utente (verifica
    // password + cambio email) viene eseguita per prima: se fallisce, non è
    // ancora stato scritto nulla (review T-6, MINOR "update non atomico").
    let setCookieHeader: string | null = null;

    // "name" fa anche da username di login (vedi src/app/api/login/route.ts)
    // ed è vincolato a livello di schema con `@@unique([name])`. Il
    // controllo qui, escludendo l'utente corrente, evita che un duplicato
    // arrivi al vincolo DB (che risponderebbe con un errore generico) e
    // permette comunque di risalvare il proprio nome invariato. Va prima di
    // tutto il resto, per lo stesso motivo dell'ordine sopra: se fallisce,
    // non deve aver già scritto nulla.
    if (name !== undefined && name !== context.activeUser.name) {
      const existing = await prisma.user.findFirst({
        where: { name, NOT: { id: context.activeUser.id } },
        select: { id: true },
      });
      if (existing) {
        return apiError(409, "Nome utente già in uso");
      }
    }

    if (wantsEmailChange) {
      // Verifica la password attuale instradandola attraverso il router
      // HTTP di Better Auth (rate-limited, vedi `src/lib/auth.ts`) prima di
      // procedere con qualunque altra scrittura.
      const verifyResponse = await callAuthEndpoint(
        request,
        "/verify-password",
        { password: currentPassword }
      );
      await readAuthEndpointResponse(verifyResponse);

      // L'email è un'operazione sensibile: sempre via Better Auth, e sempre
      // instradata attraverso il router HTTP (non `auth.api.changeEmail`
      // diretto) per beneficiare del suo rate-limit nativo su /change-email
      // (review T-6, MAJOR #1). Con `requireEmailVerification: true` (vedi
      // `src/lib/auth.ts`) l'email corrente dell'utente è sempre già
      // verificata, quindi Better Auth non applica mai qui
      // `updateEmailWithoutVerification`: invia invece un link di conferma
      // alla NUOVA email e l'email in `User` resta quella vecchia finché
      // l'utente non lo clicca (vedi `sendVerificationEmail` in
      // `src/lib/auth.ts`). `callbackURL` riporta l'utente sul profilo dopo
      // la conferma invece del default "/".
      const changeEmailResponse = await callAuthEndpoint(
        request,
        "/change-email",
        { newEmail: email, callbackURL: "/dashboard/profile" }
      );
      await readAuthEndpointResponse(changeEmailResponse);
      // Nessun cambio di sessione da propagare qui: `setSessionCookie` in
      // Better Auth scatta solo nel ramo "senza verifica" sopra, che nel
      // nostro caso non si attiva mai. Resta per coprire quel caso limite
      // senza dover ricordarsene se un giorno cambiasse la configurazione.
      setCookieHeader = changeEmailResponse.headers.get("set-cookie");
    }

    // Nome e avatar sono campi di Better Auth (tabella `user`): passano dalla
    // sua API così la sessione resta coerente con lo storage.
    if (name !== undefined || image !== undefined) {
      await auth.api.updateUser({
        body: { name, image },
        headers: request.headers,
      });
    }

    // Dati anagrafici: tabella separata (PersonalData), gestita dal nostro
    // repository. Il gruppo "core" (colonne NOT NULL) arriva tutto insieme
    // (vedi updateProfileSchema); phone/nationality/guardian* sono colonne
    // nullable indipendenti e vengono passate quando presenti, senza dover
    // essere tutte valorizzate (il vincolo "tutore obbligatorio se
    // minorenne" è già garantito a monte dallo schema Zod).
    // Non contiene l'email: `User.email` resta l'unica fonte di verità,
    // altrimenti un cambio email rifiutato da Better Auth (es. email già in
    // uso, che risponde comunque `status:true` per anti-enumeration)
    // avrebbe comunque fatto divergere questa copia (review T-6, MAJOR #3).
    if (
      firstName !== undefined &&
      lastName !== undefined &&
      ssn !== undefined &&
      address !== undefined &&
      dateOfBirth !== undefined &&
      placeOfBirth !== undefined
    ) {
      await upsertPersonalData(prisma, context.activeUser.id, {
        firstName,
        lastName,
        ssn,
        address,
        dateOfBirth,
        placeOfBirth,
        phone,
        nationality,
        guardianName,
        guardianPhone,
        guardianEmail,
      });
    }

    // Toggle "Notifiche via email" (T-0xx): colonna diretta su `User`, non
    // un'operazione Better Auth (non è un campo di autenticazione), quindi
    // scritta via il repository invece che via `auth.api.updateUser`.
    if (emailNotificationsEnabled !== undefined) {
      await setEmailNotificationsEnabled(
        prisma,
        context.activeUser.id,
        emailNotificationsEnabled
      );
    }

    const response = NextResponse.json({ success: true });
    if (setCookieHeader) {
      response.headers.set("set-cookie", setCookieHeader);
    }
    return response;
  } catch (error) {
    if (error instanceof APIError) {
      return apiError(
        error.statusCode ?? 400,
        error.body?.message ?? error.message
      );
    }
    console.error("Error updating profile:", error);
    return apiError(500, "Internal server error");
  }
}
