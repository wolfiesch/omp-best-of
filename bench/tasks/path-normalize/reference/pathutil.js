export function normalize(input) {
	const absolute = input.startsWith("/");
	const stack = [];
	for (const segment of input.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment !== "..") {
			stack.push(segment);
			continue;
		}
		const previous = stack[stack.length - 1];
		if (previous !== undefined && previous !== "..") {
			stack.pop();
			continue;
		}
		// Above the root there is nothing to climb, so an absolute path swallows the parent.
		if (!absolute) stack.push("..");
	}
	const joined = stack.join("/");
	if (absolute) return `/${joined}`;
	return joined === "" ? "." : joined;
}
