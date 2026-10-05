-- PersonalData no longer duplicates the user's email: `User.email` (Better
-- Auth) is the single source of truth. Keeping a copy here allowed it to
-- diverge from the real login email whenever a change-email request was
-- silently rejected (e.g. anti-enumeration on an email already in use),
-- see review of T-6 (MAJOR #3).
ALTER TABLE "PersonalData" DROP COLUMN "email";
