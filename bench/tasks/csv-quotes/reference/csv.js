export function parseCsvLine(line) {
	const fields = [];
	let field = "";
	let quoted = false;
	let index = 0;
	let atFieldStart = true;
	while (index < line.length) {
		const char = line[index];
		if (atFieldStart && char === '"') {
			quoted = true;
			atFieldStart = false;
			index += 1;
			continue;
		}
		atFieldStart = false;
		if (quoted) {
			if (char === '"') {
				if (line[index + 1] === '"') {
					field += '"';
					index += 2;
					continue;
				}
				quoted = false;
				index += 1;
				continue;
			}
			field += char;
			index += 1;
			continue;
		}
		if (char === ",") {
			fields.push(field);
			field = "";
			atFieldStart = true;
			index += 1;
			continue;
		}
		field += char;
		index += 1;
	}
	fields.push(field);
	return fields;
}
