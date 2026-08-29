import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve(process.argv[2] ?? "dist/public");
const requireCommit = process.env.REQUIRE_BUILD_COMMIT === "1";
const expectedCommit = (process.env.VITE_BUILD_COMMIT ?? "").trim();
const failures = [];

const fail = (message) => failures.push(message);

if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) {
  fail(`静的ビルドの出力先がありません: ${outputDir}`);
}

const walk = (directory) => {
  if (!fs.existsSync(directory)) return [];
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
};

const files = walk(outputDir);
const requiredFiles = ["index.html", "assets/vault-tumbler-mark.svg"];
for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(outputDir, relativePath))) {
    fail(`必須公開ファイルがありません: ${relativePath}`);
  }
}

const textExtensions = new Set([".css", ".html", ".js", ".json", ".map", ".svg", ".txt"]);
const textFiles = files.filter((filePath) => textExtensions.has(path.extname(filePath).toLowerCase()));
const contents = textFiles.map((filePath) => fs.readFileSync(filePath, "utf8"));
const combined = contents.join("\n");

const forbiddenTokens = [
  "%VITE_ANALYTICS_ENDPOINT%",
  "%VITE_ANALYTICS_WEBSITE_ID%",
  "/manus-storage/",
  "__manus__",
  "debug-collector",
  "vite-plugin-manus",
  "BUILT_IN_FORGE_API",
];
for (const token of forbiddenTokens) {
  if (combined.includes(token)) {
    fail(`公開ビルドに禁止された残留値があります: ${token}`);
  }
}

if (requireCommit && !expectedCommit) {
  fail("公開ビルド用のVITE_BUILD_COMMITが設定されていません");
}
if (expectedCommit && !combined.includes(expectedCommit)) {
  fail(`公開ビルドにコミット番号が埋め込まれていません: ${expectedCommit}`);
}

const assetReferences = new Set();
const assetPattern = /(?:["'(]|^)((?:\/[^"'()\s]+)?\/?assets\/[^"'()\s]+)/gm;
for (const content of contents) {
  for (const match of content.matchAll(assetPattern)) {
    const reference = match[1];
    const assetsIndex = reference.indexOf("assets/");
    if (assetsIndex < 0) continue;
    const relativeReference = reference.slice(assetsIndex).split(/[?#]/, 1)[0];
    assetReferences.add(relativeReference);
  }
}
for (const relativePath of assetReferences) {
  if (relativePath.includes("..")) {
    fail(`公開ビルドの素材参照が親ディレクトリへ移動しています: ${relativePath}`);
    continue;
  }
  if (!fs.existsSync(path.join(outputDir, relativePath))) {
    fail(`公開ビルドから参照された素材がありません: ${relativePath}`);
  }
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`静的公開ビルドを確認しました: ${files.length} files`);
}
