const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const PACKAGES = [
  "common",
  "fractional-indexing",
  "math",
  "element",
  "excalidraw",
];
const PACKAGE_NAMES = new Map(
  PACKAGES.map((packageName) => [packageName, `@miragari/mivo-${packageName}`]),
);
const ROOT = path.resolve(__dirname, "..");
const PACKAGES_DIR = path.join(ROOT, "packages");
const STAGING_DIR = path.join(ROOT, ".mivo-release");

const getArgument = (name) => {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
};

const version = getArgument("version");
const shouldPublish = process.argv.includes("--publish");

if (!version) {
  throw new Error("Pass --version, for example --version=0.18.1-mivo.0");
}
if (!/^\d+\.\d+\.\d+-mivo\.\d+$/.test(version)) {
  throw new Error(`Invalid Mivo prerelease version: ${version}`);
}

const assertCleanWorktree = () => {
  const status = execFileSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (status) {
    throw new Error("Mivo releases must be created from a clean worktree");
  }
};

const runYarn = (args, cwd = ROOT) => {
  execFileSync("npx", ["--yes", "yarn@1.22.22", ...args], {
    cwd,
    stdio: "inherit",
  });
};

const buildPackages = () => {
  runYarn(["--frozen-lockfile"]);
  runYarn(["rm:build"]);
  for (const packageName of PACKAGES) {
    runYarn(["run", "build:esm"], path.join(PACKAGES_DIR, packageName));
  }
};

const stagePackages = () => {
  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  for (const packageName of PACKAGES) {
    const sourceDir = path.join(PACKAGES_DIR, packageName);
    const targetDir = path.join(STAGING_DIR, packageName);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(sourceDir, "package.json"), "utf8"),
    );

    manifest.name = PACKAGE_NAMES.get(packageName);
    manifest.version = version;
    manifest.repository = "https://github.com/xindong/mivo-excalidraw";
    manifest.homepage = "https://github.com/xindong/mivo-excalidraw";
    manifest.bugs = "https://github.com/xindong/mivo-excalidraw/issues";
    manifest.publishConfig = { access: "public" };

    if (manifest.dependencies) {
      for (const dependencyName of PACKAGES) {
        const dependencyKey = `@excalidraw/${dependencyName}`;
        if (manifest.dependencies[dependencyKey]) {
          manifest.dependencies[dependencyKey] =
            `npm:${PACKAGE_NAMES.get(dependencyName)}@${version}`;
        }
      }
    }

    fs.mkdirSync(targetDir, { recursive: true });
    fs.cpSync(path.join(sourceDir, "dist"), path.join(targetDir, "dist"), {
      recursive: true,
    });
    fs.copyFileSync(
      path.join(ROOT, "LICENSE"),
      path.join(targetDir, "LICENSE"),
    );
    for (const documentName of ["README.md", "CHANGELOG.md"]) {
      const documentPath = path.join(sourceDir, documentName);
      if (fs.existsSync(documentPath)) {
        fs.copyFileSync(documentPath, path.join(targetDir, documentName));
      }
    }
    if (packageName === "excalidraw") {
      fs.copyFileSync(
        path.join(ROOT, "MIVO_FORK.md"),
        path.join(targetDir, "MIVO_FORK.md"),
      );
      fs.cpSync(
        path.join(ROOT, "dev-docs", "docs", "mivo"),
        path.join(targetDir, "docs"),
        { recursive: true },
      );
      manifest.files = Array.from(
        new Set([
          ...(manifest.files ?? []),
          "CHANGELOG.md",
          "MIVO_FORK.md",
          "docs",
        ]),
      );
    }
    fs.writeFileSync(
      path.join(targetDir, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
};

const validatePackageFiles = () => {
  const collectExportTargets = (value) => {
    if (typeof value === "string") {
      return [value];
    }
    if (!value || typeof value !== "object") {
      return [];
    }
    return Object.values(value).flatMap(collectExportTargets);
  };

  for (const packageName of PACKAGES) {
    const packageDir = path.join(STAGING_DIR, packageName);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
    );
    const targets = [
      manifest.main,
      manifest.module,
      manifest.types,
      ...collectExportTargets(manifest.exports),
    ].filter((target) => typeof target === "string" && !target.includes("*"));
    for (const target of new Set(targets)) {
      if (!fs.existsSync(path.resolve(packageDir, target))) {
        throw new Error(`${manifest.name} export does not exist: ${target}`);
      }
    }
    const packResult = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json"], {
        cwd: packageDir,
        encoding: "utf8",
      }),
    )[0];
    console.info(
      `Validated ${manifest.name}@${manifest.version}: ${packResult.files.length} files, ${packResult.size} bytes`,
    );
  }
};

const publishPackages = () => {
  const npmUser = execFileSync("npm", ["whoami"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (npmUser !== "miragari") {
    throw new Error(
      `Expected npm user \"miragari\" before publishing, received \"${npmUser}\"`,
    );
  }
  for (const packageName of PACKAGES) {
    const packageSpec = `${PACKAGE_NAMES.get(packageName)}@${version}`;
    const lookup = spawnSync(
      "npm",
      ["view", packageSpec, "version", "--json"],
      {
        cwd: ROOT,
        encoding: "utf8",
      },
    );
    if (lookup.status === 0) {
      throw new Error(`Refusing to overwrite published package ${packageSpec}`);
    }
    const lookupError = `${lookup.stdout ?? ""}\n${lookup.stderr ?? ""}`;
    if (!lookupError.includes("E404")) {
      throw new Error(
        `Could not verify whether ${packageSpec} already exists:\n${lookupError}`,
      );
    }
  }
  for (const packageName of PACKAGES) {
    execFileSync("npm", ["publish", "--access", "public", "--tag", "mivo"], {
      cwd: path.join(STAGING_DIR, packageName),
      stdio: "inherit",
    });
  }
};

assertCleanWorktree();
buildPackages();
stagePackages();
validatePackageFiles();

if (shouldPublish) {
  publishPackages();
} else {
  console.info(`Staged Mivo packages in ${STAGING_DIR}`);
}
