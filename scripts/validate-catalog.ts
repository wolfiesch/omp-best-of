/**
 * Fails when the marketplace catalog and the package manifest disagree, or when
 * the plugin source would be rejected by OMP's relative-source resolver.
 */
const catalog = (await Bun.file(".omp-plugin/marketplace.json").json()) as {
	name?: string;
	metadata?: { version?: string };
	plugins?: { name?: string; source?: unknown; version?: string }[];
};
const manifest = (await Bun.file("package.json").json()) as { name?: string; version?: string };

const problems: string[] = [];
if (catalog.name !== manifest.name) problems.push(`catalog name ${catalog.name} does not match package name ${manifest.name}`);
if (catalog.metadata?.version !== manifest.version) {
	problems.push(`catalog version ${catalog.metadata?.version} does not match package version ${manifest.version}`);
}

const entry = catalog.plugins?.[0];
if (!entry?.name) problems.push("first plugin entry needs a name");
if (entry?.version !== manifest.version) problems.push(`plugin entry version ${entry?.version} does not match package version ${manifest.version}`);
if (typeof entry?.source === "string") {
	if (!entry.source.startsWith("./")) problems.push(`relative plugin source must start with "./", found "${entry.source}"`);
} else if (!entry?.source) {
	problems.push("first plugin entry needs a source");
}

if (problems.length > 0) {
	process.stderr.write(`${problems.map(problem => `- ${problem}`).join("\n")}\n`);
	process.exit(1);
}
process.stdout.write(`${catalog.name} catalog matches ${manifest.name}@${manifest.version}\n`);
