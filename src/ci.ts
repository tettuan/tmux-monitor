import type { Result, ValidationError } from "./types.ts";
import type { CommandExecutor, Logger } from "./services.ts";

/**
 * CI Manager Class - Single Responsibility: CI Environment Management
 */
export class CIManager {
  private constructor(
    private commandExecutor: CommandExecutor,
    private logger: Logger,
  ) {}

  static create(commandExecutor: CommandExecutor, logger: Logger): CIManager {
    return new CIManager(commandExecutor, logger);
  }

  detectCIEnvironment(): Promise<
    Result<boolean, ValidationError & { message: string }>
  > {
    const ciIndicators = [
      "CI",
      "CONTINUOUS_INTEGRATION",
      "GITHUB_ACTIONS",
      "GITLAB_CI",
      "JENKINS_URL",
      "CIRCLECI",
      "TRAVIS",
      "BUILDKITE",
      "DRONE",
    ];

    for (const indicator of ciIndicators) {
      if (Deno.env.get(indicator)) {
        this.logger.info(`CI environment detected: ${indicator}`);
        return Promise.resolve({ ok: true, data: true });
      }
    }

    return Promise.resolve({ ok: true, data: false });
  }

  handleCIMonitoring(): Promise<
    Result<void, ValidationError & { message: string }>
  > {
    this.logger.info(
      "Running in CI environment - executing single monitoring cycle",
    );

    // In CI environment, we typically want to avoid interactive features
    // and run a single monitoring cycle

    return Promise.resolve({ ok: true, data: undefined });
  }
}
