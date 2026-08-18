const BLOCKED = new Set(["__proto__", "prototype", "constructor"]);
function plain(value) { if (value === null || typeof value !== "object") return false; const proto = Object.getPrototypeOf(value); return proto === Object.prototype || proto === null; }
function clone(value) { if (Array.isArray(value)) return value.map(clone); if (!plain(value)) return value; const result = Object.create(Object.getPrototypeOf(value)); for (const key of Object.keys(value)) if (!BLOCKED.has(key) && value[key] !== undefined) result[key] = clone(value[key]); return result; }
export function deepMerge(base, overlay) {
	if (overlay === undefined) return clone(base); if (!plain(base) || !plain(overlay)) return clone(overlay); const result = Object.create(Object.getPrototypeOf(overlay) === null ? null : Object.getPrototypeOf(base) === null ? null : Object.prototype);
	for (const key of Object.keys(base)) if (!BLOCKED.has(key)) result[key] = clone(base[key]);
	for (const key of Object.keys(overlay)) { if (BLOCKED.has(key) || overlay[key] === undefined) continue; result[key] = plain(result[key]) && plain(overlay[key]) ? deepMerge(result[key], overlay[key]) : clone(overlay[key]); } return result;
}
