import type { Lang } from "./i18n";

export const formatDate = (value: string | null, lang: Lang = "zh"): string => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (lang === "en") {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium"
  }).format(date);
};
