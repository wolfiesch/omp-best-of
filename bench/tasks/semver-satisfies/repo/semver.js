function part(version, index) {
	return Number(version.split("-")[0].split(".")[index]);
}

export function satisfies(version, range) {
	if (range.startsWith("^")) {
		const base = range.slice(1);
		return part(version, 0) === part(base, 0) && version >= base;
	}
	if (range.startsWith("~")) {
		const base = range.slice(1);
		return part(version, 0) === part(base, 0) && part(version, 1) === part(base, 1) && version >= base;
	}
	if (range.startsWith(">=")) {
		return version >= range.slice(2);
	}
	if (range.startsWith("<")) {
		return version < range.slice(1);
	}
	return version === range;
}
