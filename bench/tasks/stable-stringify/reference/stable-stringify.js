export function stableStringify(value) {
	const stack = new WeakSet();
	const encode = current => {
		if (current === null) return "null";
		switch (typeof current) {
			case "boolean": return current ? "true" : "false";
			case "string": return JSON.stringify(current);
			case "number":
				if (!Number.isFinite(current)) throw new TypeError("non-finite number");
				return Object.is(current, -0) ? "0" : String(current);
			case "object": break;
			default: throw new TypeError("unsupported value");
		}
		if (stack.has(current)) throw new TypeError("cyclic value");
		stack.add(current);
		try {
			if (Array.isArray(current)) {
				const values = [];
				for (let index = 0; index < current.length; index += 1) {
					if (!Object.hasOwn(current, index)) throw new TypeError("sparse array");
					values.push(encode(current[index]));
				}
				return `[${values.join(",")}]`;
			}
			const prototype = Object.getPrototypeOf(current);
			if (prototype !== Object.prototype && prototype !== null) throw new TypeError("non-plain object");
			return `{${Object.keys(current).sort().map(key => `${JSON.stringify(key)}:${encode(current[key])}`).join(",")}}`;
		} finally {
			stack.delete(current);
		}
	};
	return encode(value);
}
