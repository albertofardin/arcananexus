-- Rename Character notes fields for clarity: printableNotes -> playerNotes, hiddenNotes -> masterNotes
ALTER TABLE "Character" RENAME COLUMN "printableNotes" TO "playerNotes";
ALTER TABLE "Character" RENAME COLUMN "hiddenNotes" TO "masterNotes";
