import { existsSync, readdirSync, statSync, readFileSync } from 'fs-extra';
import path from 'path';
import assert from 'assert';
import crypto from 'crypto';
import { TimeAnalyticsPlugin } from '../time-analytics-webpack-plugin/types';
import shelljs from 'shelljs';
import { MONOREPO_FOLDER_PATH, PROJ_ROOT_PATH, repoInit } from './util';
import type { Configuration, webpack } from 'webpack';
import { expect } from 'chai';

const setupMonoTestRepo = (): void => {
  shelljs.pushd();
  shelljs.cd(MONOREPO_FOLDER_PATH);
  console.log('install package for test mono repos');
  shelljs.exec('pnpm i');
  shelljs.popd();
};

const buildSrc = () => {
  shelljs.pushd();
  shelljs.cd(PROJ_ROOT_PATH);
  console.log('build source code and link repos');
  shelljs.exec('pnpm -r run build');
  shelljs.popd();
};

buildSrc();
setupMonoTestRepo();

describe('Time Analyze Plugin', () => {
  const allTestRepoNames: string[] = [];
  readdirSync(MONOREPO_FOLDER_PATH).forEach(fileName => {
    const filePath = path.normalize(path.join(MONOREPO_FOLDER_PATH, fileName));
    const stat = statSync(filePath);
    if (stat.isDirectory() && !filePath.includes('node_modules')) {
      const repoName = path.basename(filePath);
      allTestRepoNames.push(repoName);
    }
  });

  allTestRepoNames.forEach(repoName => {
    describe(repoName, () => {
      const repoPath = path.join(MONOREPO_FOLDER_PATH, repoName);

      repoInit(repoPath);

      const webpackPackagePath = require.resolve('webpack', {
        paths: [repoPath],
      });

      assert(existsSync(webpackPackagePath), 'each repo must be able to find a webpack package.');

      // Find the real webpack which is used by the repo
      // This allows repo to use differnt version of webpack
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const webpackFunc: any = require(webpackPackagePath);
      const webpackConfigurationPath = path.join(repoPath, 'webpack.config.js');

      assert(existsSync(webpackPackagePath), 'each repo must have a webpack config called "webpack.config.js" in the root.');

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const webpackConfig: Configuration = require(webpackConfigurationPath);

      assert(!!webpackConfig?.output?.path, "there must be 'output.path' in the configuration.");

      const outputFolder = webpackConfig?.output?.path;

      const logFilePath = path.join(repoPath, './tmp.log');

      const wrappedWebpackConfig = TimeAnalyticsPlugin.wrap(webpackConfig, {
        outputFile: logFilePath,
        loader: {
          groupedByAbsolutePath: true,
        },
      });

      it('should be transparent when use TimeAnalyticsPlugin', async () => {
        await executeWebpack(webpackFunc, webpackConfig);
        const originDistHash = hashOfFolder(outputFolder);
        await executeWebpack(webpackFunc, wrappedWebpackConfig);
        const warpDistHash = hashOfFolder(outputFolder);
        expect(originDistHash.toString()).to.be.equal(warpDistHash.toString());
      });

      it('should have a log file if set "outputFile" option', async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(existsSync(logFilePath)).to.be.true;
      });
    });
  });
});

async function executeWebpack(webpackFunc: typeof webpack, config: Configuration) {
  return new Promise((resolve, reject) => {
    webpackFunc(config, (err, stats) => {
      const isError = err || stats?.hasErrors();
      if (isError) {
        return reject(err || stats);
      }
      resolve(undefined);
    });
  });
}

function hashOfFile(filePath: string) {
  const stat = statSync(filePath);
  assert(stat.isFile(), `${filePath} should be a file.`);

  const fileBuffer = readFileSync(filePath);
  const hashSum = crypto.createHash('sha256');
  hashSum.update(fileBuffer);
  const hex = hashSum.digest();
  return hex;
}

function hashOfFolder(folderPath: string) {
  const stat = statSync(folderPath);
  assert(stat.isDirectory(), `${folderPath} should be a folder`);

  let ret: Uint8Array = Uint8Array.from([]);
  readdirSync(folderPath).forEach(fileName => {
    const filePath = path.normalize(path.join(folderPath, fileName));
    const stat2 = statSync(filePath);
    assert(stat2.isFile(), `${filePath} should be a file, no need to emit a folder under our test repo.`);
    const hashOfCurrentFile = hashOfFile(filePath);
    ret = xorUint8Array(ret, hashOfCurrentFile);
  });
  return ret;
}

function xorUint8Array(a: Uint8Array, b: Uint8Array) {
  const length = Math.max(a.byteLength, b.byteLength);
  const ret = new Uint8Array(length);
  for (let index = 0; index < ret.length; index++) {
    const valueOfA = a?.[index] ?? 0;
    const valueOfB = b?.[index] ?? 0;
    ret[index] = valueOfA ^ valueOfB;
  }
  return ret;
}
