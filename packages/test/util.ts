import { existsSync } from 'fs';
import { copySync } from 'fs-extra';
import shelljs from 'shelljs';
import path from 'path';
import assert from 'assert';

export const MONOREPO_FOLDER_PATH = path.join(__dirname, 'monorepos');
const COMMON_FOLDER_PATH = path.join(__dirname, 'common');
const PROJ_ROOT_PATH = path.join(__dirname, '../');

export const setupMonoTestRepo = (): void => {
    shelljs.pushd();
    shelljs.cd(MONOREPO_FOLDER_PATH);
    console.log('install package for test mono repos');
    shelljs.exec('pnpm i');
    shelljs.popd();
};

export const buildSrc = () => {
    shelljs.pushd();
    shelljs.cd(PROJ_ROOT_PATH);
    console.log('build source code and link repos');
    shelljs.exec('pnpm -r run build');
    shelljs.popd();
};

assert(existsSync(COMMON_FOLDER_PATH), 'could not found "common" folder, which contains common files');
assert(existsSync(MONOREPO_FOLDER_PATH), 'could not found "monorepo" folder, which is the root of each real test cases');

export function repoInit(repoFolder: string) {
    // move all files from 'common' to `repoFolder`
    copySync(COMMON_FOLDER_PATH, repoFolder);
}