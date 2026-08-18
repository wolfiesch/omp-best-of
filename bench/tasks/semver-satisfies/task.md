`satisfies(version, range)` in `semver.js` does not implement its contract. Fix it.

Versions are `major.minor.patch`, optionally followed by `-` and a dot-separated prerelease,
for example `1.2.3` or `1.2.3-beta.2`. A range is one of `1.2.3`, `^1.2.3`, `~1.2.3`,
`>=1.2.3`, or `<1.2.3`.

The contract:

- Compare major, minor, and patch numerically, never as text, so `1.10.0` is greater than
  `1.9.0`.
- `^` allows changes that do not modify the leftmost non-zero component. `^1.2.3` means
  `>=1.2.3 <2.0.0`, `^0.2.3` means `>=0.2.3 <0.3.0`, and `^0.0.3` allows only `0.0.3`.
- `~1.2.3` allows patch-level changes only, that is `>=1.2.3 <1.3.0`.
- A version carrying a prerelease satisfies a range only when the range's own version carries
  a prerelease and has the same major, minor, and patch. So `1.2.3-beta.2` satisfies
  `^1.2.3-beta.1`, while `1.2.4-beta.1` satisfies neither `^1.2.0` nor `^1.2.3-beta.1`.
- A prerelease sorts below the same version without one, so `1.2.3-beta.1` is less than
  `1.2.3`.
- Within a prerelease, compare identifiers left to right. Numeric identifiers compare
  numerically, non-numeric identifiers compare by character order, a numeric identifier sorts
  below a non-numeric one, and a prerelease that is a prefix of another sorts below it.

Keep the exported name and signature, and return a boolean.

`bun test` runs the visible tests. They already pass and cover only the basics, so passing
them is not proof.
