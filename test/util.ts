import { assert } from '../src/utils';
import { existsSync } from 'fs';
import { copySync } from 'fs-extra';
import path from 'path';

const MONOREPO_FOLDER_PATH = path.join(__dirname, 'monorepos');
const COMMON_FOLDER_PATH = path.join(__dirname, 'common');


assert(existsSync(COMMON_FOLDER_PATH), 'could not found "common" folder, which contains common files');
assert(existsSync(MONOREPO_FOLDER_PATH), 'could not found "monorepo" folder, which is the root of each real test cases');

export function repoInit(repoFolder: string) {
    // move all files from 'common' to `repoFolder`
    copySync(COMMON_FOLDER_PATH, repoFolder);
}

export { MONOREPO_FOLDER_PATH };