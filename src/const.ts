import * as path from 'path';
import * as fs from 'fs';

export const PACKAGE_NAME = 'time-analytics-webpack-plugin';
export const PACKAGE_LOADER_PATH = path.join(PACKAGE_NAME, 'dist', 'loader');
export const NS = path.dirname(fs.realpathSync(__filename));
