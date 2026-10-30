# Publishing Locus

The package is `@granawkins/locus`; the executable is `locus`. The repository
metadata points to `https://github.com/granawkins/locus`.

Before the first release, confirm that the npm account can publish to the
`@granawkins` scope. This machine is not currently logged in to npm. Nothing
has been published or pushed as part of the repository cleanup.

```sh
npm ci
npm test
npm pack --dry-run
```

Inspect the archive from `npm pack` and install it in an isolated prefix to
check the actual consumer installation. The package file allowlist excludes
local `.locus/` state, credentials, tests, and development files. No build is
required. `prepack` runs the tests automatically.

## Dependency issue identified during preparation

The published Pi 1.4.0 dependency requires `undici` 8.10.2, which npm currently
flags with high-severity advisories. The checkout uses an override to 8.12.3,
but npm does not apply a dependency package's overrides to consumer installs.
Fresh installations of the packed Locus package still receive 8.10.2.

Resolve this before treating the package as release-ready, preferably by
updating to a compatible upstream Pi release with a patched dependency.
Do not assume the checkout's clean audit applies to the published package.

Once the package and dependencies are ready, publish with an authorized npm
account and public access. `publishConfig.access` already selects public
visibility. Push the reviewed repository to its configured GitHub remote
separately.
