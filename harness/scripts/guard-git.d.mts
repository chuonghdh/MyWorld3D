/** What the guard needs to know about the repository. Injected, so the decision stays pure. */
export interface GitGuardContext {
  /** Current branch name ('' when unknown). */
  branch: string;
  /** Base branch of a pull request. `pr` is the number, url or branch from the command line, or null for the current branch. Null when unreadable. */
  prBase: (pr: string | null) => string | null;
}

/** Splits a shell line into simple commands (arrays of words). Quotes are honoured; operators end a command. */
export declare function splitCommands(line: string): string[][];

/** Hook entry: reads the hook JSON on stdin; exit code 2 on a block. `projectDir` is where git and gh run. */
export declare function main(projectDir?: string): void;

/** Returns the one-line reason to block `command`, or null to let it run. */
export declare function decideGit(command: string, ctx: GitGuardContext): string | null;
