export * from "./organization.repository";
export * from "./campaign.repository";
export * from "./dataType.repository";
// NB: il repository `Data` piatto è stato ritirato con la migrazione
// metamodel_dati_campagna (T-015): sostituito da `ReferenceData` (catalogo)
// e `CharacterData` (istanza/assegnazione). `referenceData.repository`
// (catalogo + requisiti) arriva con T-016, `characterData.repository`
// (servizio assegnazione, T-017; lettura mirata per la sidebar/visibilità
// condizionale, T-020) con T-017/T-020.
export * from "./referenceData.repository";
export * from "./characterData.repository";
export * from "./dataRequirement.repository";
export * from "./event.repository";
export * from "./character.repository";
export * from "./membership.repository";
export * from "./personalData.repository";
export * from "./grant.repository";
export * from "./user.repository";
export * from "./xpTransaction.repository";
export * from "./action.repository";
export * from "./featureType.repository";
export * from "./feature.repository";
export * from "./characterTalentUnlock.repository";
export * from "./printLayout.repository";
export * from "./types";
