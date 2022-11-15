import path from 'path';
import fs from 'fs';

export const PACKAGE_NAME = 'webpack-analyze-plugin';
export const loaderPath = `${PACKAGE_NAME}/loader`;
export const NS = path.dirname(fs.realpathSync(__filename));
