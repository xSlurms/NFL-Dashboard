// What counts as a big play. Touchdowns and interceptions are always big plays.

export interface BigPlayRules {
  longRushYards: number;
  longCatchYards: number;
  /** "all" shows fumbles the offense recovered too; "lost" shows turnovers only. */
  fumbles: "all" | "lost" | "none";
  fieldGoals: { made: boolean; missed: boolean };
}

export const DEFAULT_RULES: BigPlayRules = {
  longRushYards: 25,
  longCatchYards: 40,
  fumbles: "all",
  fieldGoals: { made: true, missed: true },
};
