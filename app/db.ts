import _ from "lodash";
import { Span } from "./util";

export enum Scope {
  Friendly,
  Enemy,
}

export enum Target {
  Self,
  Single,
  Many,
}

export type Entry = {
  duration: Span;
  cooldown: Span;
  scope: Scope;
  targeting: Target;
  job: string;
  sets: Array<string>;
};

export type Database = { [actionID: number]: Entry };

const ACTIONS: Database = {
  // TEST ==================================================================
  [0x99]: {
    // Thunder III (test)
    duration: 24,
    cooldown: 2.5,
    scope: Scope.Enemy,
    targeting: Target.Single,
    job: "blm",
    sets: ["test"],
  },

  // DAMAGE ================================================================
  [0x8d2]: {
    // Trick Attack
    duration: 15,
    cooldown: 60,
    scope: Scope.Enemy,
    targeting: Target.Single,
    job: "nin",
    sets: ["damage"],
  },
  [0x1d0c]: {
    // Chain Stratagem
    duration: 15,
    cooldown: 120,
    scope: Scope.Enemy,
    targeting: Target.Single,
    job: "sch",
    sets: ["damage"],
  },
  [0x40a8]: {
    // Divination
    duration: 15,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "ast",
    sets: ["damage"],
  },
  [0x1ce4]: {
    // Brotherhood
    duration: 15,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "mnk",
    sets: ["damage"],
  },
  [0xde5]: {
    // Battle Litany
    duration: 15,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "drg",
    sets: ["damage"],
  },
  [0x3f44]: {
    // Technical Finish (Quadruple)
    duration: 20,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "dnc",
    sets: ["damage"],
  },
  [0x1d60]: {
    // Embolden
    duration: 20,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "rdm",
    sets: ["damage"],
  },
  [0x5f55]: {
    // Arcane Circle
    duration: 20,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "rpr",
    sets: ["damage"],
  },
  [0x76]: {
    // Battle Voice
    duration: 15,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "brd",
    sets: ["damage"],
  },
  [0x64c9]: {
    // Searing Light
    duration: 30,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "smn",
    sets: ["damage"],
  },

  // DEFENSIVE =============================================================
  [0x1d88]: {
    // Addle
    duration: 10,
    cooldown: 90,
    scope: Scope.Enemy,
    targeting: Target.Single,
    job: "blm",
    sets: ["mitigation", "test"],
  },
  [0x3e8c]: {
    // Shield Samba
    duration: 15,
    cooldown: 120,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "dnc",
    sets: ["mitigation"],
  },
  [0x3f18]: {
    // Superbolide
    duration: 8,
    cooldown: 360,
    scope: Scope.Friendly,
    targeting: Target.Self,
    job: "gnb",
    sets: ["mitigation"],
  },
  [0x3f20]: {
    // Heart of Light
    duration: 15,
    cooldown: 90,
    scope: Scope.Friendly,
    targeting: Target.Many,
    job: "gnb",
    sets: ["mitigation"],
  },

  // HEALING ===============================================================
};

export const querySets = (q: string[]): Database =>
  _.pickBy(ACTIONS, ({ sets }) => _.intersection(sets, q).length > 0);
