import fs from "node:fs";
import path from "node:path";

const outputDir = path.resolve(process.argv[2] ?? "dist/public");
const failures = [];

const fail = message => failures.push(message);
const readText = relativePath => {
  const filePath = path.join(outputDir, relativePath);
  if (!fs.existsSync(filePath)) {
    fail(`公開成果物に必要なファイルがありません: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(filePath, "utf8");
};

if (!fs.existsSync(outputDir) || !fs.statSync(outputDir).isDirectory()) {
  fail(`公開成果物の出力先がありません: ${outputDir}`);
}

const index = readText("index.html");
const walk = directory => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
};
const files = walk(outputDir);
const textFiles = files.filter(filePath =>
  [".css", ".html", ".js", ".json", ".svg"].includes(
    path.extname(filePath).toLowerCase()
  )
);
const combined = textFiles
  .map(filePath => fs.readFileSync(filePath, "utf8"))
  .join("\n");

const requireMatch = (source, pattern, message) => {
  if (!pattern.test(source)) fail(message);
};

requireMatch(
  index,
  /<html[^>]+lang=["']ja["']/i,
  "公開ページの言語設定が日本語ではありません"
);
requireMatch(
  index,
  /<meta[^>]+name=["']viewport["'][^>]+content=["'][^"']*width=device-width[^"']*initial-scale=1(?:\.0)?[^"']*viewport-fit=cover/i,
  "iPhone向けviewport設定（実寸・safe area）がありません"
);
requireMatch(
  index,
  /<meta[^>]+name=["']theme-color["']/i,
  "theme-colorがありません"
);
requireMatch(
  index,
  /<meta[^>]+name=["']description["'][^>]+(?:アケルン|akerun)/i,
  "ゲーム説明のmeta descriptionがありません"
);
requireMatch(
  index,
  /<title>[^<]*アケルン/i,
  "ページタイトルにゲーム名がありません"
);
requireMatch(index, /id=["']root["']/i, "Reactの描画先rootがありません");
requireMatch(
  index,
  /type=["']module["'][^>]+src=["'][^"']+\.js/i,
  "ビルド済みmodule scriptがありません"
);
if (index.includes("%BASE_URL%") || index.includes("/src/main.tsx")) {
  fail("公開index.htmlにViteの未置換パスが残っています");
}

if (!files.some(filePath => path.extname(filePath).toLowerCase() === ".js")) {
  fail("公開成果物にJavaScriptファイルがありません");
}
if (!files.some(filePath => path.extname(filePath).toLowerCase() === ".css")) {
  fail("公開成果物にCSSファイルがありません");
}

requireMatch(
  combined,
  /akerun-action-prompt/,
  "現在の操作表示がビルドへ含まれていません"
);
requireMatch(
  combined,
  /プレイ中メニュー/,
  "プレイ中メニューのアクセシブルな名前がありません"
);
requireMatch(
  combined,
  /data-build-commit/,
  "ビルド識別子の表示属性がありません"
);
requireMatch(
  combined,
  /min-height:44px|min-height: 44px/,
  "モバイル操作ボタンの44px基準がありません"
);
requireMatch(
  combined,
  /touch-action:manipulation|touch-action: manipulation/,
  "ボタンの誤ジェスチャー抑制がありません"
);
requireMatch(
  combined,
  /user-select:none|user-select: none/,
  "ゲーム中の長押し選択抑制がありません"
);
requireMatch(
  combined,
  /-webkit-touch-callout:none|-webkit-touch-callout: none/,
  "iOS長押しメニュー抑制がありません"
);

const forbiddenTokens = [
  "%VITE_ANALYTICS_ENDPOINT%",
  "%VITE_ANALYTICS_WEBSITE_ID%",
  "%BASE_URL%",
  "/manus-storage/",
  "__manus__",
  "debug-collector",
  "vite-plugin-manus",
  "BUILT_IN_FORGE_API",
];
for (const token of forbiddenTokens) {
  if (combined.includes(token))
    fail(`公開成果物に禁止された残留値があります: ${token}`);
}

if (failures.length > 0) {
  console.error(failures.map(failure => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log(`公開前リリースゲートを確認しました: ${files.length} files`);
}
