-- Nuovo valore enum per distinguere la rimozione di un talento posseduto
-- (master, "Elimina" in "Talenti acquisiti", sempre amount 0/nessun
-- rimborso) dagli aggiustamenti manuali del saldo XP (reason "update").
ALTER TYPE "XpReason" ADD VALUE 'removal';
