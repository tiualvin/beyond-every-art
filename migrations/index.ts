import * as migration_20260728_102927_initial from './20260728_102927_initial';

export const migrations = [
  {
    up: migration_20260728_102927_initial.up,
    down: migration_20260728_102927_initial.down,
    name: '20260728_102927_initial'
  },
];
