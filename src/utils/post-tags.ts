const DRAFT_TOKEN = "draft";
export const DEFAULT_POST_TAG = "general";

const normalizeTagToken = (value: string) => {
  return value.trim().toLowerCase();
};

const splitTags = (value: string | null | undefined) => {
  return (value ?? "")
    .split(",")
    .map((token) => normalizeTagToken(token))
    .filter(Boolean);
};

export const normalizeTagFilterValue = (value: string | null | undefined) => {
  const [firstTag] = splitTags(value);
  return firstTag ?? null;
};

export const normalizeStoredTagValue = (value: string | null | undefined, includeDraft = false) => {
  const tags = splitTags(value).filter((token) => token !== DRAFT_TOKEN);

  if (includeDraft) {
    tags.push(DRAFT_TOKEN);
  }

  const normalizedTags = Array.from(new Set(tags));
  return normalizedTags.length > 0 ? normalizedTags.join(",") : null;
};

export const coerceStoredTagValue = (value: string | null | undefined) => {
  const normalizedValue = normalizeStoredTagValue(value, isDraftTag(value));

  if (normalizedValue && normalizedValue !== DRAFT_TOKEN) {
    return normalizedValue;
  }

  return isDraftTag(value) ? `${DEFAULT_POST_TAG},${DRAFT_TOKEN}` : DEFAULT_POST_TAG;
};

export const isDraftTag = (value: string | null | undefined) => {
  return splitTags(value).some((token) => token === DRAFT_TOKEN);
};

export const tagInputValue = (value: string | null | undefined) => {
  return splitTags(value)
    .filter((token) => token !== DRAFT_TOKEN)
    .join(", ");
};

export const displayTagValues = (value: string | null | undefined) => {
  const displayTags = splitTags(value).filter((token) => token !== DRAFT_TOKEN);

  return Array.from(new Set(displayTags));
};

export const buildTagValue = (rawTagValue: string, includeDraft: boolean) => {
  return normalizeStoredTagValue(rawTagValue, includeDraft);
};