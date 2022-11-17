import { existsSync, readdirSync, statSync } from 'fs-extra';
import { MONOREPO_FOLDER_PATH, repoInit } from './util';
import path from 'path';
import assert from 'assert';
import { TimeAnalyticsPlugin } from 'time-analytics-plugin';

describe('Time Analyze Plugin', () => {
  const allTestRepoPaths: string[] = [];
  readdirSync(MONOREPO_FOLDER_PATH).forEach(filePath => {
    const stat = statSync(filePath);
    if (stat.isDirectory() && !filePath.includes('node_modules')) {
      const repoName = path.basename(filePath);
      allTestRepoPaths.push(repoName);
    }
  });

  allTestRepoPaths.forEach(repoPath => {
    // 
  });

  const REPO_NAME = 'repo1';

  describe('repo1', () => {
    const repoPath = path.join(MONOREPO_FOLDER_PATH, REPO_NAME);
    repoInit(repoPath);

    const webpackPackagePath = require.resolve('webpack', {
      paths: [repoPath],
    });

    assert(existsSync(webpackPackagePath), 'each repo must be able to find a webpack package.');

    // need `require` clause here to find the real `Webpack` packge, in fact, I think webpack only support cjs now
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webpackFunc: any = require(webpackPackagePath);
    const webpackConfigurationPath = path.join(repoPath, 'webpack.config.js');

    assert(existsSync(webpackPackagePath), 'each repo must have a webpack config called "webpack.config.js" in the root.');

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const webpackConfig = require(webpackConfigurationPath);

    const finalWebpackConfig = TimeAnalyticsPlugin.wrap(webpackConfig);

    test('the example test case', async () => {
      return new Promise((resolve, reject) => {
        webpackFunc(finalWebpackConfig, (err: any, stats: any) => {
          if (err || stats?.hasErrors()) return reject(err || stats);
          // const fileContent = standardConf.map(conf =>
          //   readFileSync(conf.output.path + "/bundle.js").toString()
          // );
          resolve(undefined);
        });
      });
    });
  });
});
