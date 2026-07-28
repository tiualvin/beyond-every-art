import * as migration_20260728_102927_initial from './20260728_102927_initial';
import * as migration_20260728_105928_add_mcp_api_keys from './20260728_105928_add_mcp_api_keys';

export const migrations = [
  {
    up: migration_20260728_102927_initial.up,
    down: migration_20260728_102927_initial.down,
    name: '20260728_102927_initial',
  },
  {
    up: migration_20260728_105928_add_mcp_api_keys.up,
    down: migration_20260728_105928_add_mcp_api_keys.down,
    name: '20260728_105928_add_mcp_api_keys'
  },
];
