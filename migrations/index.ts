import * as migration_20260728_102927_initial from './20260728_102927_initial';
import * as migration_20260728_105928_add_mcp_api_keys from './20260728_105928_add_mcp_api_keys';
import * as migration_20260812_045137_add_media_ai_generated_and_upload_tool from './20260812_045137_add_media_ai_generated_and_upload_tool';
import * as migration_20260813_060733_add_apps_and_waitlist from './20260813_060733_add_apps_and_waitlist';
import * as migration_20260820_005134_add_oauth_clients_and_grants from './20260820_005134_add_oauth_clients_and_grants';
import * as migration_20260820_050554_add_oauth_replay_detection from './20260820_050554_add_oauth_replay_detection';
import * as migration_20260820_122559_add_upload_media_from_url_capability from './20260820_122559_add_upload_media_from_url_capability';
import * as migration_20260821_160357_relax_ghost_id_add_trash_and_og_size from './20260821_160357_relax_ghost_id_add_trash_and_og_size';
import * as migration_20260823_154928_add_noindex_to_posts_and_pages from './20260823_154928_add_noindex_to_posts_and_pages';

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
    name: '20260813_060733_add_apps_and_waitlist',
  },
  {
    up: migration_20260820_005134_add_oauth_clients_and_grants.up,
    down: migration_20260820_005134_add_oauth_clients_and_grants.down,
    name: '20260820_005134_add_oauth_clients_and_grants',
  },
  {
    up: migration_20260820_050554_add_oauth_replay_detection.up,
    down: migration_20260820_050554_add_oauth_replay_detection.down,
    name: '20260820_050554_add_oauth_replay_detection',
  },
  {
    up: migration_20260820_122559_add_upload_media_from_url_capability.up,
    down: migration_20260820_122559_add_upload_media_from_url_capability.down,
    name: '20260820_122559_add_upload_media_from_url_capability',
  },
  {
    up: migration_20260821_160357_relax_ghost_id_add_trash_and_og_size.up,
    down: migration_20260821_160357_relax_ghost_id_add_trash_and_og_size.down,
    name: '20260821_160357_relax_ghost_id_add_trash_and_og_size',
  },
  {
    up: migration_20260823_154928_add_noindex_to_posts_and_pages.up,
    down: migration_20260823_154928_add_noindex_to_posts_and_pages.down,
    name: '20260823_154928_add_noindex_to_posts_and_pages'
  },
];
