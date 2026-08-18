function parse(input) {
	const dash = input.indexOf("-");
	const core = dash === -1 ? input : input.slice(0, dash);
	const pre = dash === -1 ? "" : input.slice(dash + 1);
	const [major, minor, patch] = core.split(".").map(Number);
	return { major, minor, patch, pre: pre === "" ? [] : pre.split(".") };
}

function comparePre(left, right) {
	if (left.length === 0 && right.length === 0) return 0;
	if (left.length === 0) return 1;
	if (right.length === 0) return -1;
	const shared = Math.min(left.length, right.length);
	for (let index = 0; index < shared; index += 1) {
		const a = left[index];
		const b = right[index];
		const aNumeric = /^\d+$/.test(a);
		const bNumeric = /^\d+$/.test(b);
		if (aNumeric && bNumeric) {
			if (Number(a) !== Number(b)) return Number(a) < Number(b) ? -1 : 1;
			continue;
		}
		if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
		if (a !== b) return a < b ? -1 : 1;
	}
	if (left.length === right.length) return 0;
	return left.length < right.length ? -1 : 1;
}

function compare(left, right) {
	if (left.major !== right.major) return left.major < right.major ? -1 : 1;
	if (left.minor !== right.minor) return left.minor < right.minor ? -1 : 1;
	if (left.patch !== right.patch) return left.patch < right.patch ? -1 : 1;
	return comparePre(left.pre, right.pre);
}

function admits(version, base) {
	if (version.pre.length === 0) return true;
	return (
		base.pre.length > 0 &&
		version.major === base.major &&
		version.minor === base.minor &&
		version.patch === base.patch
	);
}

function caretUpper(base) {
	if (base.major !== 0) return { major: base.major + 1, minor: 0, patch: 0, pre: [] };
	if (base.minor !== 0) return { major: 0, minor: base.minor + 1, patch: 0, pre: [] };
	return { major: 0, minor: 0, patch: base.patch + 1, pre: [] };
}

export function satisfies(version, range) {
	const parsed = parse(version);
	if (range.startsWith("^") || range.startsWith("~")) {
		const base = parse(range.slice(1));
		if (!admits(parsed, base) || compare(parsed, base) < 0) return false;
		const upper = range.startsWith("~")
			? { major: base.major, minor: base.minor + 1, patch: 0, pre: [] }
			: caretUpper(base);
		return compare(parsed, upper) < 0;
	}
	if (range.startsWith(">=")) {
		const base = parse(range.slice(2));
		return admits(parsed, base) && compare(parsed, base) >= 0;
	}
	if (range.startsWith("<")) {
		const base = parse(range.slice(1));
		return admits(parsed, base) && compare(parsed, base) < 0;
	}
	const base = parse(range);
	return compare(parsed, base) === 0;
}
