import { writeFile } from "node:fs/promises";
import { renderOfficialProblemBalanceMarkdown } from "../client/src/game/OfficialProblemBalance";

await writeFile(
  new URL("../docs/official-problem-balance.md", import.meta.url),
  renderOfficialProblemBalanceMarkdown(),
  "utf8"
);
