/**
 * Environment-based configuration for Workers
 */

export interface WorkerConfig {
  parallel: {
    apiKey: string;
  };
  anthropic: {
    apiKey: string;
  };
  mistral: {
    apiKey: string;
  };
  moonshot: {
    apiKey: string;
  };
  kv: {
    cacheTtl: {
      scrape: number;      // 7 days
      evaluate: number;    // 7 days
      failure: number;     // 1 day
    };
  };
  queues: {
    batchSize: {
      scrape: number;
      evaluate: number;
      upload: number;
    };
  };
}

export function getConfig(env: Record<string, string>): WorkerConfig {
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
    kv: {
      cacheTtl: {
        scrape: 604800,  // 7 days
        evaluate: 604800, // 7 days
        failure: 86400,  // 1 day
      },
    },
    queues: {
      batchSize: {
        scrape: 10,
        evaluate: 20,
        upload: 30,
      },
    },
  };
}
