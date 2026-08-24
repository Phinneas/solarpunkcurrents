/**
 * Worker-specific configuration
 * Does not import dotenv - uses Cloudflare env bindings directly
 */

export interface WorkerEnv {
  PARALLEL_API_KEY?: string;
  ANTHROPIC_API_KEY: string;
  MISTRAL_API_KEY: string;
  MOONSHOT_API_KEY: string;
}

export function getWorkerEnv(env: WorkerEnv) {
  return {
    parallel: {
      apiKey: env.PARALLEL_API_KEY ?? '',
    },
    anthropic: {
      apiKey: env.ANTHROPIC_API_KEY,
    },
    mistral: {
      apiKey: env.MISTRAL_API_KEY,
    },
    moonshot: {
      apiKey: env.MOONSHOT_API_KEY,
    },
  };
}
