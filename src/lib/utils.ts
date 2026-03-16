import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { LocalizedText } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getLocalizedTextString(value?: string | LocalizedText | null): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (typeof value.text === "string" && value.text.trim() !== "") {
    return value.text;
  }
  return undefined;
}
