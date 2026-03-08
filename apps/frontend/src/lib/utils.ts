export const today = (): string => new Date().toISOString().split("T")[0];

export const GHC = "\u20B5"; // ₵

export const fmt = (n: number | string): string =>
  `GH${GHC}${Number(n).toLocaleString("en-GH")}`;
