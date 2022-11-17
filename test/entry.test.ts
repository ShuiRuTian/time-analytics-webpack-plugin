import { PACKAGE_NAME } from '@src/const';
import { readdirSync, statSync } from 'fs-extra';
import { MONOREPO_FOLDER_PATH, repoInit } from './util';

describe(PACKAGE_NAME, () => {
  const allTestRepoPaths: string[] = [];
  readdirSync(MONOREPO_FOLDER_PATH).forEach(filePath => {
    const stat = statSync(filePath);
    if (stat.isDirectory() && !filePath.includes('node_modules')) {
      allTestRepoPaths.push(filePath);
    }
  });

  allTestRepoPaths.forEach(repoPath => {
    // 
  });

  describe('repo1', () => {
    repoInit(`${MONOREPO_FOLDER_PATH}/repo1`);
    test('hello', () => {
      console.log('hello');
    })
  });
});
