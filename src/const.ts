import * as path from 'path';
import * as fs from 'fs';

export const PACKAGE_NAME = 'webpack-analyze-plugin';
export const PACKAGE_LOADER_PATH = `${PACKAGE_NAME}/loader`;
export const NS = path.dirname(fs.realpathSync(__filename));
