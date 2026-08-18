export function applyPatch(document, operations) {
	const result = { ...document };
	for (const operation of operations) {
		if (operation.op === "replace") result[operation.path.slice(1)] = operation.value;
	}
	return result;
}
