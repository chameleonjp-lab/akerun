const rawBaseUrl = process.argv[2];
if (!rawBaseUrl) {
  console.error("公開URLを指定してください");
  process.exitCode = 1;
} else {
  const baseUrl = new URL(rawBaseUrl.endsWith("/") ? rawBaseUrl : `${rawBaseUrl}/`);
  const failures = [];
  const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  const fetchTextWithRetry = async (url) => {
    let lastError = "unknown error";
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        const response = await fetch(url, { redirect: "follow" });
        if (response.ok) return { response, text: await response.text() };
        lastError = `HTTP ${response.status}`;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      await sleep(5000);
    }
    throw new Error(`${url} が取得できません: ${lastError}`);
  };

  try {
    const indexUrl = new URL("index.html", baseUrl);
    const index = await fetchTextWithRetry(indexUrl);
    const references = new Set(["assets/vault-tumbler-mark.svg"]);
    const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
    for (const match of index.text.matchAll(attributePattern)) {
      const reference = match[1];
      if (!reference || reference.startsWith("#") || reference.startsWith("data:") || reference.startsWith("mailto:") || reference.startsWith("javascript:")) continue;
      const url = new URL(reference, indexUrl);
      if (url.origin === baseUrl.origin) references.add(url.href);
    }

    for (const reference of references) {
      const url = reference.startsWith("http") ? new URL(reference) : new URL(reference, baseUrl);
      try {
        const result = await fetchTextWithRetry(url);
        console.log(`OK ${result.response.status} ${url.pathname}`);
      } catch (error) {
        failures.push(error instanceof Error ? error.message : String(error));
      }
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }

  if (failures.length > 0) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`公開URLのHTML・JavaScript・CSS・faviconを確認しました: ${baseUrl.href}`);
  }
}
