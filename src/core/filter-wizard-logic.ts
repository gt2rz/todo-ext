export function resolveStep<T>(picked: T | undefined, current: T | undefined): T | undefined {
    return picked === undefined ? current : picked;
}

export function resolveOptionStep<T>(pickedItem: { value: T } | undefined, current: T | undefined): T | undefined {
    return pickedItem === undefined ? current : pickedItem.value;
}

export function normalizeTextFilter(value: string, lowercase = false): string | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }
    return lowercase ? trimmed.toLowerCase() : trimmed;
}

export function resolveTagsSelection(
    pickedKeywords: string[] | undefined,
    totalTags: number,
    current: Set<string> | undefined
): Set<string> | undefined {
    if (pickedKeywords === undefined) {
        return current;
    }
    if (pickedKeywords.length === 0 || pickedKeywords.length === totalTags) {
        return undefined;
    }
    return new Set(pickedKeywords);
}
