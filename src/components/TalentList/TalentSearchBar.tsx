"use client";

import FieldText from "@/components/_core/FieldText";

interface ITalentSearchBar {
  value: string;
  onChange: (value: string) => void;
}

// Riga di ricerca condivisa da ManagerDataTalents e ModalTalentsLearn (T-046).
export const TalentSearchBar = ({ value, onChange }: ITalentSearchBar) => (
  <FieldText
    className="mx-2"
    icon="search"
    placeholder="Cerca..."
    value={value}
    onChange={onChange}
  />
);

export default TalentSearchBar;
