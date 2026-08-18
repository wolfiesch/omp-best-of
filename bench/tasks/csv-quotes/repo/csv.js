export function parseCsvLine(line) {
	return line.split(",").map(field => {
		if (field.startsWith('"') && field.endsWith('"')) {
			return field.slice(1, -1);
		}
		return field;
	});
}
