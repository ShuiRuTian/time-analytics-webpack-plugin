import { existsSync } from 'fs';
import { copySync } from 'fs-extra';
import path from 'path';
import assert from 'assert';

const MONOREPO_FOLDER_PATH = path.join(__dirname, 'monorepos');
const COMMON_FOLDER_PATH = path.join(__dirname, 'common');
const PROJ_ROOT_PATH = path.join(__dirname, '../');


assert(existsSync(COMMON_FOLDER_PATH), 'could not found "common" folder, which contains common files');
assert(existsSync(MONOREPO_FOLDER_PATH), 'could not found "monorepo" folder, which is the root of each real test cases');

export function repoInit(repoFolder: string) {
    // move all files from 'common' to `repoFolder`
    copySync(COMMON_FOLDER_PATH, repoFolder);
}

export { MONOREPO_FOLDER_PATH, PROJ_ROOT_PATH };