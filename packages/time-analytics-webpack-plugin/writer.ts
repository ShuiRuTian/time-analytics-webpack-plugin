import { writeFileSync } from 'fs';
import { EOL } from 'os';
import { curry, descend, prop, sort } from 'ramda';
import chalk, { Chalk } from 'chalk';
import { LoaderAnalyticsResult, MetaAnalyticsResult, OutputOption, PluginAnalyticsResult } from './analyzer';
import { PACKAGE_NAME } from './const';
import { ConsoleHelper, fail } from './utils';
import path from 'path';
import { getLoaderName } from './loaderHelper';

const colorTime = curry((limit: number, color: Chalk, time: number) => {
    if (time >= limit) {
        const formatedTime = color(time.toFixed(4) + ' ms');
        return color(formatedTime);
    }
    return undefined;
});

function prettyTime(ms: number, option: OutputOption) {
    const dangerTime = colorTime(option.dangerTimeLimit, chalk.red);
    const warnTime = colorTime(option.warnTimeLimit, chalk.yellow);
    const safeTime = colorTime(0, chalk.green);
    for (const func of [dangerTime, warnTime, safeTime]) {
        const res = func(ms);
        if (res)
            return res;
    }

    fail('We did not give a pretty message about time, why?');
}

const headerText = '┌── time-analytics-webpack-plugin';
const sectionStartPrefix = '├── ';
const nextLinePrefix = '│ ';

interface TimeObject { time: number }

const byTime = descend<TimeObject>(prop('time'));

export abstract class Writer {
    static foo(a: MetaAnalyticsResult, b: PluginAnalyticsResult, c: LoaderAnalyticsResult, option: OutputOption) {
        const messages = ['', headerText];

        // #region meta
        messages.push(`${nextLinePrefix}Webpack compile takes ${prettyTime(a.totalTime, option)}`);
        // #endregion meta

        // #region plugin
        messages.push(`${sectionStartPrefix}${chalk.blue(chalk.bold('Plugins'))}`);
        let allPluginTime = 0;
        sort(byTime, b.pluginsInfo).forEach(({ name: pluginName, time }) => {
            messages.push(`${nextLinePrefix}Plugin ${chalk.bold(pluginName)} takes ${prettyTime(time, option)}`);
            allPluginTime += time;
        });
        messages.push(`${nextLinePrefix}All plugins take ${prettyTime(allPluginTime, option)}`);
        // #endregion plugin

        // #region loaders
        messages.push(`${sectionStartPrefix}${chalk.blue(chalk.bold('Loaders'))}`);
        let allLoaderTime = 0;
        let isDuplicatedLodaerIdOutputed = false;
        const loaderIdSet = new Set<string>();
        sort(byTime, c.loadersInfo).forEach(({ path: loaderPath, time }) => {
            if (option.ignoredLoaders.includes(loaderPath)) {
                messages.push(`${nextLinePrefix}Loader ${chalk.bold(loaderPath)} is ignored.`);
                return;
            }
            allLoaderTime += time;

            const loaderName = getLoaderName(loaderPath);
            const loaderId = option.groupLoaderByPath ? loaderPath : loaderName;
            if (loaderIdSet.has(loaderId)) {
                isDuplicatedLodaerIdOutputed = true;
            }
            loaderIdSet.add(loaderId);

            messages.push(`${nextLinePrefix}Loader ${chalk.bold(loaderId)} takes ${prettyTime(time, option)}`);
        });
        if (isDuplicatedLodaerIdOutputed) {
            messages.push(`${nextLinePrefix}There are many differnt loaders that have same assumed name. Consider use "loader.groupedByAbsolutePath" option to show the full path of loaders.`);
        }
        messages.push(`${nextLinePrefix}All loaders take ${prettyTime(allLoaderTime, option)}`);
        // #endregion loaders

        messages.push('');

        const content = messages.join(EOL);

        // #region meta
        if (option.filePath) {
            const outputFileAbsolutePath = path.resolve(option.filePath);
            ConsoleHelper.log(`[${PACKAGE_NAME}]: try to write file to file "${outputFileAbsolutePath}"`);
            writeFileSync(option.filePath, content);
        } else {
            console.log(content);
        }
        // #endregion meta
    }
}