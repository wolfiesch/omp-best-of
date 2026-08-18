export function normalize(input) {
	const absolute = input.startsWith("/");
	const segments = input.split("/").filter(segment => segment !== "" && segment !== ".");
	const stack = [];
	for (const segment of segments) {
		if (segment === "..") {
			stack.pop();
			continue;
		}
		stack.push(segment);
	}
	const joined = stack.join("/");
	return absolute ? `/${joined}` : joined;
}
