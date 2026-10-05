import { CHARACTER_TYPE } from "@/lib/constants";
import type { Character } from "@/lib/validations/character";

export const typeLabel = (type: Character["type"]) =>
  CHARACTER_TYPE[type].label;

export const typeIcon = (type: Character["type"]) => CHARACTER_TYPE[type].icon;

export const typeColor = (type: Character["type"]) =>
  CHARACTER_TYPE[type].color;
