/**
 * @tested src/config.test.ts
 * @handbook 2.3-config-validation
 */
import { checkGhostUrl, checkGhostKey } from './validation.js';

export interface Config {
  ghostUrl: string;
  ghostAdminApiKey: string;
}

export function loadConfig(): Config {
  const ghostUrl = process.env.GHOST_URL;
  const ghostAdminApiKey = process.env.GHOST_ADMIN_API_KEY;

  if (!ghostUrl || !ghostAdminApiKey) {
    throw new Error(
      'Missing required environment variables: GHOST_URL, GHOST_ADMIN_API_KEY'
    );
  }

  const urlError = checkGhostUrl(ghostUrl);
  if (urlError) throw new Error(`GHOST_URL: ${urlError}`);

  const keyError = checkGhostKey(ghostAdminApiKey);
  if (keyError) throw new Error(`GHOST_ADMIN_API_KEY: ${keyError}`);

  return { ghostUrl, ghostAdminApiKey };
}
