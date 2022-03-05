import _ from "lodash";
import { UIEvent, UIEventHandler } from "react";

type NonMethodKeys<T> = ({
  [P in keyof T]: T[P] extends Function ? never : P;
} & { [x: string]: never })[keyof T];

export type Struct<T> = Pick<T, NonMethodKeys<T>>;
export type Dict = { [key: string]: string };
export type Option<T> = T | null;

// XXX: I don't think there's a way to separate explicitly open objects (e.g.,
// mapping from player name to value) from implicitly open structs, so we have
// no choice but to make the open object keys optional, which doesn't make
// sense.
export type SerializedUnstable<T> = T extends Date
  ? string
  : T extends object
  ? { [P in keyof T]?: SerializedUnstable<T[P]> }
  : T extends Array<infer E>
  ? Array<SerializedUnstable<E>>
  : T;

export type Percent = number;
export type Span = number;
export type RelativeTime = number;

// helper to functionally set a key in an object by returning a new copy
export const fset = <A, B>(obj: A, extensions: B): A & B =>
  _.defaults(extensions, obj);

// Because TypeScript DOM types don't support CustomEvents by default
export const addEventListener = <T>(
  name: string,
  f: (_: CustomEvent<T>) => void
) => {
  document.addEventListener(name, f as EventListener);
};

export const noBubble = (f: UIEventHandler) => (e: UIEvent) => {
  e.stopPropagation();
  f(e);
};

export const parseQuery = (): Dict => {
  const search = document.location.search;
  const query: Dict = {};

  if (search[0] === "?") {
    search
      .slice(1)
      .split("&")
      .map((pair) => pair.split("="))
      .forEach(([k, v]) => {
        query[k] = v;
      });
  }

  return query;
};

declare global {
  interface DateConstructor {
    diff(a: Date, b: Date): Span;
    max(a: Date, b: Date): Date;
  }

  interface Date {
    add(t: Span): Date;
  }
}

Date.diff = (a: Date, b: Date): Span => a.getTime() - b.getTime();
Date.max = (a: Date, b: Date): Date => (a > b ? new Date(a) : new Date(b));
Date.prototype.add = function (t: Span): Date {
  return new Date(this.getTime() + t);
};

declare global {
  interface Map<K, V> {
    update(key: K, f: (_: Option<V>) => Option<V>): Map<K, V>;
    remove(key: K): Map<K, V>;
    filter(f: (_: Option<V>) => boolean): Map<K, V>;
  }
}

// Functional updating for maps
Map.prototype.update = function (key, f) {
  const x = f(this.get(key));
  return new Map(this).set(key, x);
};

// Functional deletion for maps
Map.prototype.remove = function (key) {
  const m = new Map(this);
  m.delete(key);
  return m;
};

// Functional filtering for maps
Map.prototype.filter = function (f) {
  const m = new Map();
  for (const [key, value] of this) {
    if (f(value)) m.set(key, value);
  }
  return m;
};

declare global {
  interface Number {
    bound(min: number, max: number): number;
  }
}

Number.prototype.bound = function (min, max) {
  return Math.min(max, Math.max(min, this.valueOf()));
};
