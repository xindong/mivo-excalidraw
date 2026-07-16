const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const PACKAGES = [
  "common",
  "fractional-indexing",
  "math",
  "element",
  "excalidraw",
];
const PACKAGE_NAMES = new Map(
  PACKAGES.map((packageName) => [
    packageName,
    `@miragari/mivo-${packageName}`,
  ]),
);
const ROOT = path.resolve(__dirname, "..");
const PACKAGES_DIR = path.join(ROOT, "packages");
const STAGING_DIR = path.join(ROOT, ".mivo-release");

const getArgument = (name) => {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
};

const version = getArgument("version");
const shouldPublish = process.argv.includes("--publish");

if (!version) {
  throw new Error("Pass --version, for example --version=0.18.1-mivo.0");
}

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
    fs.copyFileSync(path.join(ROOT, "LICENSE"), path.join(targetDir, "LICENSE"));
    fs.writeFileSync(
      path.join(targetDir, "package.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
};

const publishPackages = () => {
  for (const packageName of PACKAGES) {
    execFileSync(
      "npm",
      ["publish", "--access", "public", "--tag", "mivo"],
      {
        cwd: path.join(STAGING_DIR, packageName),
        stdio: "inherit",
      },
    );
  }
};

buildPackages();
stagePackages();

if (shouldPublish) {
  publishPackages();
} else {
  console.info(`Staged Mivo packages in ${STAGING_DIR}`);
}
