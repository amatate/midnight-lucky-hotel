import { jsxDEV as reactJsxDEV } from "react/jsx-dev-runtime";
import { localizedProps } from "./translate";
export { Fragment } from "react/jsx-dev-runtime";
export type { JSX } from "react";
export const jsxDEV: typeof reactJsxDEV = (type, props, key, staticChildren, source, self) =>
  reactJsxDEV(type, localizedProps(type, props), key, staticChildren, source, self);
