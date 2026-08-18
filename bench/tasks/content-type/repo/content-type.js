export function parseContentType(input) {
	const [type, ...parts] = input.split(";");
	if (!type.includes("/")) return null;
	const parameters = {};
	for (const part of parts) { const [name, value] = part.split("="); if (!name || value === undefined) return null; parameters[name.trim().toLowerCase()] = value.trim().replace(/^"|"$/g, ""); }
	return { type: type.trim().toLowerCase(), parameters };
}
