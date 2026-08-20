import {
  createOfficialPuzzle,
  OFFICIAL_PROBLEM_CATALOG,
  type ProblemTier,
} from "./GameDefinitions";
import { LockMechanism } from "./LockMechanism";
import { calculateRunScore } from "./RunSession";

export type OfficialProblemBalance = {
  readonly problemId: string;
  readonly vault: string;
  readonly wheelCount: number;
  readonly minimumDialSteps: number;
  readonly totalPasses: number;
  readonly falseGateCount: number;
  readonly parTime: number;
  readonly parDialSteps: number;
  readonly parFaults: number;
  readonly difficulty: ProblemTier;
  readonly baselineScore: number;
};

const measureMinimumDialSteps = (problemId: string) => {
  const puzzle = createOfficialPuzzle(problemId);
  const lock = new LockMechanism(puzzle);
  let steps = 0;

  for (let index = 0; index < puzzle.stages.length; index += 1) {
    const stage = puzzle.stages[index];
    let guard = 0;
    while (lock.stage === index && guard < 10000) {
      lock.rotate(stage.direction === "cw" ? 1 : -1);
      steps += 1;
      guard += 1;
    }
    if (lock.stage !== index + 1) {
      throw new Error(`公式問題 ${problemId} の自動計測が停止しました。`);
    }
  }

  return steps;
};

export const measureOfficialProblemBalance = (
  problemId: string
): OfficialProblemBalance => {
  const definition = OFFICIAL_PROBLEM_CATALOG.find(
    item => item.problemId === problemId
  );
  if (!definition) throw new Error("Unknown official problem: " + problemId);
  const puzzle = createOfficialPuzzle(problemId);
  const minimumDialSteps = measureMinimumDialSteps(problemId);
  const totalPasses = puzzle.stages.reduce(
    (sum, stage) => sum + stage.passes,
    0
  );

  return {
    problemId,
    vault: puzzle.vault.title,
    wheelCount: puzzle.vault.wheelCount,
    minimumDialSteps,
    totalPasses,
    falseGateCount: puzzle.falseGates.length,
    parTime: definition.parTime,
    parDialSteps: definition.parDialSteps,
    parFaults: definition.parFaults,
    difficulty: definition.tier,
    baselineScore: calculateRunScore(
      puzzle,
      definition.parTime,
      definition.parFaults,
      minimumDialSteps,
      0
    ),
  };
};

export const OFFICIAL_PROBLEM_BALANCE: readonly OfficialProblemBalance[] =
  OFFICIAL_PROBLEM_CATALOG.map(problem =>
    measureOfficialProblemBalance(problem.problemId)
  );
