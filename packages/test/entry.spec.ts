import type { Configuration, webpack } from 'webpack';
import { existsSync, readdirSync, statSync, readFileSync } from 'fs-extra';
import path from 'path';
import assert from 'assert';
import crypto from 'crypto';
import { TimeAnalyticsPlugin } from 'time-analytics-webpack-plugin';
import SpeedMeasureWebpackPlugin from 'speed-measure-webpack-plugin';
import { buildSrc, MONOREPO_FOLDER_PATH, repoInit, setupMonoTestRepo } from './util';
import { expect } from 'chai';
// Import internal exports
import { MultiWebpackConfiguration, isMultiWebpackConfiguration } from 'time-analytics-webpack-plugin/TimeAnalyticsPlugin';

buildSrc();
setupMonoTestRepo();

const debug$repoSkipList:string[] = [
  'repo_multiple_configurations',
  // 'repo1',
];

describe('Time Analyze Plugin', () => {
  const allTestRepoNames: string[] = [];
  readdirSync(MONOREPO_FOLDER_PATH).forEach(fileName => {
    const filePath = path.normalize(path.join(MONOREPO_FOLDER_PATH, fileName));
    const stat = statSync(filePath);
    if (stat.isDirectory() && !filePath.includes('node_modules')) {
      const repoName = path.basename(filePath);
      if (debug$repoSkipList.includes(repoName)) {
        return;
      }
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
      const webpackConfig: Configuration | MultiWebpackConfiguration = require(webpackConfigurationPath);

      const outputFolders: string[] = [];

      const addOutputFolder = (config: Configuration) => { 
        assert(!!config?.output?.path, "there must be 'output.path' in the configuration.");
        const outputFolder = config?.output?.path;
          outputFolders.push(outputFolder);
      };
      
      if (!isMultiWebpackConfiguration(webpackConfig)) {
        addOutputFolder(webpackConfig);
      } else {
        webpackConfig.forEach(addOutputFolder);
      }

      const logFilePath = path.join(repoPath, './tmp.log');

      const ignoredLoaderNames = ['css-loader'];

      const wrappedWebpackConfig = TimeAnalyticsPlugin.wrap(webpackConfig, {
        outputFile: logFilePath,
        loader: {
          groupedByAbsolutePath: true,
          exclude: ignoredLoaderNames,
        },
      });

      it.skip(('this case is only used to debug TimeAnalyticsWebpackPlugin, change skip to only if you want to debug'), async () => {
        await executeWebpack(webpackFunc, wrappedWebpackConfig);
      });

      it.skip(('this case is only used to debug SpeedMeasureWebpackPlugin, change skip to only if you want to debug'), async () => {
        const swp = new SpeedMeasureWebpackPlugin();
        const webpackConfigForSwp: any = swp.wrap(webpackConfig as any);
        await executeWebpack(webpackFunc, webpackConfigForSwp);
      });

      it('should be transparent when use TimeAnalyticsPlugin', async () => {
        await executeWebpack(webpackFunc, webpackConfig);
        const originDistHash = hashOfFolders(outputFolders);
        await executeWebpack(webpackFunc, wrappedWebpackConfig);
        const warpDistHash = hashOfFolders(outputFolders);
        expect(originDistHash.toString()).to.be.equal(warpDistHash.toString());
      });

      it('should have a log file if set "outputFile" option', async () => {
        // await executeWebpack(webpackFunc, wrappedWebpackConfig);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        expect(existsSync(logFilePath)).to.be.true;
      });

      it('should ignore the loader time if set "loader.exclude" option', async () => {
        // await executeWebpack(webpackFunc, wrappedWebpackConfig);
        const content = readFileSync(logFilePath, 'utf-8')
          .split(/\r?\n/);
        const matcher = new RegExp(`Loader .*?(${ignoredLoaderNames.join('|')}).*? is ignored by "loader.exclude" option`);
        content.some(line => line.match(matcher));
      });
    });
  });
});

async function executeWebpack(webpackFunc: typeof webpack, config: Configuration): Promise<unknown>;
async function executeWebpack(webpackFunc: typeof webpack, config: MultiWebpackConfiguration): Promise<unknown>;
async function executeWebpack(webpackFunc: typeof webpack, config: Configuration | MultiWebpackConfiguration) {
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

function hashOfFolders(folderPaths: string[]) { 
  const hashValues = folderPaths.map(hashOfFolder);
  return hashValues.reduce((pre, cur) => {
    return xorUint8Array(pre, cur);
  }, Uint8Array.from([]));
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

