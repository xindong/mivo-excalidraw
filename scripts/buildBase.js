const path = require("path");
const fs = require("fs");

const { build } = require("esbuild");

// contains all dependencies bundled inside
const getEntryPoints = () => {
  const entryPoints = ["src/index.ts"];
  if (fs.existsSync(path.resolve(process.cwd(), "src/visualdebug.ts"))) {
    entryPoints.push("src/visualdebug.ts");
  }
  return entryPoints;
};

const packageName = path.basename(process.cwd());

const getConfig = (outdir) => ({
  outdir,
  bundle: true,
  format: "esm",
  entryPoints: getEntryPoints(),
  entryNames: "[name]",
  assetNames: "[dir]/[name]",
  alias: {
    "@excalidraw/utils": path.resolve(__dirname, "../packages/utils/src"),
    [`@excalidraw/${packageName}`]: path.resolve(process.cwd(), "src"),
  },
  external: [
    "@excalidraw/common",
    "@excalidraw/element",
    "@excalidraw/math",
    "@excalidraw/fractional-indexing",
  ],
});

function buildDev(config) {
  return build({
    ...config,
    sourcemap: true,
    define: {
      "import.meta.env": JSON.stringify({ DEV: true }),
    },
  });
}

function buildProd(config) {
  return build({
    ...config,
    minify: true,
    define: {
      "import.meta.env": JSON.stringify({ PROD: true }),
    },
  });
}

const createESMRawBuild = async () => {
  // development unminified build with source maps
  await buildDev(getConfig("dist/dev"));

  // production minified build without sourcemaps
  await buildProd(getConfig("dist/prod"));
};

(async () => {
  await createESMRawBuild();
})();
