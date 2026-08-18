function decode(value) { try { return decodeURIComponent(value.replaceAll("+", " ")); } catch { throw new TypeError("Malformed query escape"); } }
function encode(value) { return encodeURIComponent(value).replaceAll("%20", "+"); }
export function mergeQuery(url, updates) {
	const hashAt = url.indexOf("#"); const fragment = hashAt < 0 ? "" : url.slice(hashAt); const beforeHash = hashAt < 0 ? url : url.slice(0, hashAt); const queryAt = beforeHash.indexOf("?"); const path = queryAt < 0 ? beforeHash : beforeHash.slice(0, queryAt); const raw = queryAt < 0 ? "" : beforeHash.slice(queryAt + 1);
	let fields = raw === "" ? [] : raw.split("&").map(part => { const eq = part.indexOf("="); return eq < 0 ? [decode(part), "", false] : [decode(part.slice(0, eq)), decode(part.slice(eq + 1)), true]; });
	for (const [name, value] of updates) { let first = fields.findIndex(field => field[0] === name); fields = fields.filter(field => field[0] !== name); if (value !== null) { const entry = [name, value, true]; if (first < 0) fields.push(entry); else fields.splice(first, 0, entry); } }
	const query = fields.map(([name, value, hadEquals]) => `${encode(name)}${hadEquals ? `=${encode(value)}` : ""}`).join("&"); return `${path}${query ? `?${query}` : ""}${fragment}`;
}
