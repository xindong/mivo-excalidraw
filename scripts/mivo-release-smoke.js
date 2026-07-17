const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const MIVO_PACKAGES = [
  "common",
  "fractional-indexing",
  "math",
  "element",
  "excalidraw",
];
const MIVO_PACKAGE_NAMES = new Map(
  MIVO_PACKAGES.map((packageName) => [
    packageName,
    `@miragari/mivo-${packageName}`,
  ]),
);

const smokeInstallPackages = (stagingDir) => {
  const hostDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "mivo-release-smoke-"),
  );
  try {
    const tarballs = new Map();
    for (const packageName of MIVO_PACKAGES) {
      const packageDir = path.join(stagingDir, packageName);
      const packResult = JSON.parse(
        execFileSync(
          "npm",
          ["pack", "--json", "--pack-destination", hostDir],
          { cwd: packageDir, encoding: "utf8" },
        ),
      )[0];
      tarballs.set(packageName, packResult.filename);
    }

    // Staged packages depend on npm aliases such as
    // `@excalidraw/common: npm:@miragari/mivo-common@<version>`. Installing all
    // tarballs as their published names does not satisfy those aliases before
    // the version exists in the registry. The smoke host must map every alias
    // directly to its local tarball.
    const dependencies = {
      react: "19.0.0",
      "react-dom": "19.0.0",
      [MIVO_PACKAGE_NAMES.get("excalidraw")]:
        `file:./${tarballs.get("excalidraw")}`,
    };
    for (const packageName of MIVO_PACKAGES) {
      if (packageName === "excalidraw") {
        continue;
      }
      dependencies[`@excalidraw/${packageName}`] =
        `file:./${tarballs.get(packageName)}`;
    }
    fs.writeFileSync(
      path.join(hostDir, "package.json"),
      `${JSON.stringify({ private: true, dependencies }, null, 2)}\n`,
    );

    execFileSync(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--package-lock=false",
      ],
      { cwd: hostDir, stdio: "inherit" },
    );

    const packageName = MIVO_PACKAGE_NAMES.get("excalidraw");
    const specifiers = [
      packageName,
      `${packageName}/canvas`,
      `${packageName}/custom-elements/react`,
      `${packageName}/index.css`,
    ];
    const resolveScript = `for (const specifier of ${JSON.stringify(
      specifiers,
    )}) console.log(specifier, require.resolve(specifier));`;
    execFileSync(
      process.execPath,
      ["--conditions=production", "-e", resolveScript],
      { cwd: hostDir, stdio: "inherit" },
    );
    console.info("Validated staged packages in an isolated npm host");
  } finally {
    fs.rmSync(hostDir, { recursive: true, force: true });
  }
};

if (require.main === module) {
  const stagingDir = process.argv[2];
  if (!stagingDir) {
    throw new Error("Pass the staged package directory");
  }
  smokeInstallPackages(path.resolve(stagingDir));
}

module.exports = {
  MIVO_PACKAGES,
  MIVO_PACKAGE_NAMES,
  smokeInstallPackages,
};
