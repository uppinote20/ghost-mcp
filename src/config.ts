/** @tested src/config.test.ts */
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

  const parsed = new URL(ghostUrl);
  if (
    parsed.protocol !== 'https:' &&
    parsed.hostname !== 'localhost' &&
    parsed.hostname !== '127.0.0.1'
  ) {
    throw new Error('GHOST_URL must use HTTPS (except for localhost)');
  }

  const keyParts = ghostAdminApiKey.split(':');
  if (keyParts.length !== 2 || !keyParts[0] || !keyParts[1]) {
    throw new Error('GHOST_ADMIN_API_KEY must be in "id:secret" format');
  }
  if (!/^[a-f0-9]+$/.test(keyParts[1])) {
    throw new Error('GHOST_ADMIN_API_KEY secret must be hex-encoded');
  }

  return { ghostUrl, ghostAdminApiKey };
}
