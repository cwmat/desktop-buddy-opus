/**
 * The buddy roster. To add a buddy: create `src/pets/<id>.ts` exporting a
 * `PetDefinition` (see ./types and the add-buddy skill), then list it here.
 */
import type { PetDefinition } from './types';
import quackers from './quackers';
import boolean from './boolean';
import glorp from './glorp';
import sprocket from './sprocket';
import capybyte from './capybyte';
import ember from './ember';
import callback from './callback';
import segfault from './segfault';
import owlgorithm from './owlgorithm';
import shellby from './shellby';
import spore from './spore';

export const PETS: readonly PetDefinition[] = [
  quackers,
  boolean,
  glorp,
  sprocket,
  capybyte,
  ember,
  callback,
  segfault,
  owlgorithm,
  shellby,
  spore,
];

export function getPet(id: string): PetDefinition {
  return PETS.find((p) => p.id === id) ?? PETS[0];
}

export type { PetDefinition } from './types';
