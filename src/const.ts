import * as path from 'path';

export const PACKAGE_NAME = 'time-analytics-webpack-plugin';
export const PACKAGE_LOADER_PATH = path.join(PACKAGE_NAME, 'dist', 'loader');

/**
 * Only `compilation` will have this unqiue key
 */
// A symbol might be better, but it's fine and string is good to debug.
export const COMPILATION_WEAK_MAP_ID_KEY = '__webpack_compilation_weak_map_Id';
