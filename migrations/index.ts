import * as migration_20260728_102927_initial from './20260728_102927_initial';
import * as migration_20260728_105928_add_mcp_api_keys from './20260728_105928_add_mcp_api_keys';
import * as migration_20260812_045137_add_media_ai_generated_and_upload_tool from './20260812_045137_add_media_ai_generated_and_upload_tool';
import * as migration_20260813_060733_add_apps_and_waitlist from './20260813_060733_add_apps_and_waitlist';

export const migrations = [
  {
    up: migration_20260728_102927_initial.up,
    down: migration_20260728_102927_initial.down,
    name: '20260728_102927_initial',
  },
  {
    up: migration_20260728_105928_add_mcp_api_keys.up,
    down: migration_20260728_105928_add_mcp_api_keys.down,
    name: '20260728_105928_add_mcp_api_keys',
  },
  {
    up: migration_20260812_045137_add_media_ai_generated_and_upload_tool.up,
    down: migration_20260812_045137_add_media_ai_generated_and_upload_tool.down,
    name: '20260812_045137_add_media_ai_generated_and_upload_tool',
  },
  {
    up: migration_20260813_060733_add_apps_and_waitlist.up,
    down: migration_20260813_060733_add_apps_and_waitlist.down,
    name: '20260813_060733_add_apps_and_waitlist'
  },
];
