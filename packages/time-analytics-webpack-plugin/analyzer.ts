import chalk, { Chalk } from 'chalk';
import { writeFileSync } from 'fs';
import { EOL } from 'os';
import { resolve } from 'path';
import { curry, groupBy, path, prop } from 'ramda';
import { PACKAGE_NAME } from './const';
import { getLoaderName } from './loaderHelper';
import { assert, fail } from './utils';

export enum AnalyzeInfoKind {
    loader,
    plugin,
    webpackMeta,
}

export enum LoaderType {
    pitch,
    normal,
}

export enum LoaderEventType {
    start,
    end,
}

export interface LoaderEventInfo {
    /**
     * Id for each pitch/normal loader function call .
     * 
     * pitch and normal loader function for the same resource also have different call Id.
     */
    callId: string;
    kind: AnalyzeInfoKind.loader;
    loaderType: LoaderType;
    /**
     * the absolute path to the loader
     */
    loaderPath: string;
    time: number;
    /**
     * source file that the loader is handling
     */
    resourcePath: string;
    /**
     * what does this event stands for, start or end.
     */
    eventType: LoaderEventType;
    /**
     * Whether this loader is async loader or sync loader.
     * 
     * async loader means this loader calls `this.async()`
     */
    isAsync: boolean;
}

export enum TapType {
    normal,
    async,
    promise,
}

export enum PluginEventType {
    start,
    end,
}

export interface PluginEventInfo {
    kind: AnalyzeInfoKind.plugin;
    /**
     * The name of the plugin
     */
    pluginName: string;
    /**
     * The first parameter of tap function, is this useful?
     * 
     * For now, we are accessing the name through `pluginInstance.constructor.name`
     */
    tapId?: never;
    time: number;
    tapType: TapType;
    /**
     * ID for each tap call.
     */
    tapCallId: string;
    /**
     * what does this event stands for, start or end.
     */
    eventType: PluginEventType;
}

/**
 * The exact one hook of webpack
 * 
 * Name format is `${hooks container name}_${hook name}`
 */
export enum WebpackMetaEventType {
    Compiler_compile,
    Compiler_done,
}

/**
 * The aim is to record timestap of some event which only runs for once
 */
export interface WebpackMetaEventInfo {
    kind: AnalyzeInfoKind.webpackMeta;
    time: number;
    hookType: WebpackMetaEventType,
}

export interface OutputOption {
    /**
     * If there is a path, will output the content to the file.
     * 
     * If file is not exist, will create it, but the folder must be existed.
     * 
     * If file is exist, overwrite the content.
     */
    filePath?: string;
    warnTimeLimit: number;
    dangerTimeLimit: number;
    groupLoaderByPath: boolean;
    /**
     * TODO: should we remove this option? Feels like we should not collect the info at all. Do this by give loader options.
     */
    ignoredLoaders: string[];
}

class WebpackTimeAnalyzer {
    private _isInitilized = false;

    initilize() {
        assert(this._isInitilized === false, '${PACKAGE_NAME} is initialized twice, why do you do this? Please submit an issue.');
        this._isInitilized = true;
    }

    clear() {
        assert(this._isInitilized === true, 'Time Analyzer must be initialized when clearing.');
        this._isInitilized = false;
        this.loaderData = [];
        this.pluginData = [];
        this.metaData = [];
    }

    private loaderData: LoaderEventInfo[] = [];

    collectLoaderInfo(loaderInfo: LoaderEventInfo) {
        this.loaderData.push(loaderInfo);
    }

    private pluginData: PluginEventInfo[] = [];

    collectPluginInfo(pluginInfo: PluginEventInfo) {
        this.pluginData.push(pluginInfo);
    }

    private metaData: WebpackMetaEventInfo[] = [];

    collectWebpackInfo(metaInfo: WebpackMetaEventInfo) {
        this.metaData.push(metaInfo);
    }

    output(option: OutputOption): void {
        assert(this._isInitilized === true, 'Time Analyzer must be initialized when outputing.');

        // TODO: split analyze and output
        const messages1 = outputMetaInfo(this.metaData, option);
        const messages2 = outputPluginInfos(this.pluginData, option);
        const messages3 = outputLoaderInfos(this.loaderData, option);
        const content = [headerText, ...messages1, ...messages2, ...messages3].join(EOL);
        if (option.filePath) {
            const outputFileAbsolutePath = resolve(option.filePath);
            console.log(`[${PACKAGE_NAME}]: try to write file to file "${outputFileAbsolutePath}"`);
            writeFileSync(option.filePath, content);
        } else {
            console.log(content);
        }

        this.clear();
    }
}

const colorTime = curry((limit: number, color: Chalk, time: number) => {
    if (time >= limit) {
        const formatedTime = color(time.toString() + 'ms');
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

function isArraySortBy<T>(paths: string[], arr: T[]) {
    let prevValue = 0;

    for (const item of arr) {
        const curValue: any = path(paths, item);
        assert(typeof curValue === 'number');
        if (curValue < prevValue) {
            return false;
        }
        prevValue = curValue;
    }
    return true;
}

const headerText = '┌── time-analytics-webpack-plugin';
const sectionStartPrefix = '├── ';
const nextLinePrefix = '│ ';

function outputMetaInfo(data: WebpackMetaEventInfo[], option: OutputOption) {
    // validate
    assert(isArraySortBy(['time'], data), 'webpack meta event info should be sorted by time.');
    const compilerCompileEvents = data.filter(info => info.hookType === WebpackMetaEventType.Compiler_compile);
    assert(compilerCompileEvents.length === 1, 'webpack must start only once');
    const compilerDoneEvents = data.filter(info => info.hookType === WebpackMetaEventType.Compiler_done);
    assert(compilerDoneEvents.length === 1, 'webpack must done only once');

    const messages: string[] = [];
    const compileTotalTime = compilerDoneEvents[0].time - compilerCompileEvents[0].time;
    messages.push(`${nextLinePrefix}Webpack compile takes ${prettyTime(compileTotalTime, option)}`);
    return messages;
}

function outputPluginInfos(data: PluginEventInfo[], option: OutputOption) {
    assert(isArraySortBy(['time'], data), 'plugin event info should be sorted by time.');

    const messages: string[] = [];

    messages.push(`${sectionStartPrefix}${chalk.blue(chalk.bold('Plugins'))}`);
    let allPluginTime = 0;
    const nameGrouppedPlugin = groupBy(prop('pluginName'), data);
    Object.entries(nameGrouppedPlugin).forEach(([pluginName, dataA]) => {
        let currentPluginTotalTime = 0;
        const idGroupedPlugin = groupBy(prop('tapCallId'), dataA);
        Object.entries(idGroupedPlugin).forEach(([tapCallId, dataB]) => {
            assert(dataB.length === 2
                && dataB[0].eventType === PluginEventType.start
                && dataB[1].eventType === PluginEventType.end
                , 'each tap execution should be collected info for start and end, once and only once.');
            const tapTime = dataB[1].time - dataB[0].time;
            currentPluginTotalTime += tapTime;
        });
        allPluginTime += currentPluginTotalTime;
        messages.push(`${nextLinePrefix}Plugin ${chalk.bold(pluginName)} takes ${prettyTime(currentPluginTotalTime, option)}`);
    });
    messages.push(`${nextLinePrefix}All plugins take ${prettyTime(allPluginTime, option)}`);
    return messages;
}

function outputLoaderInfos(data: LoaderEventInfo[], option: OutputOption) {
    assert(isArraySortBy(['time'], data), 'loader event info should be sorted by time.');

    const messages: string[] = [];

    const loaderIdSet = new Set<string>();
    let isDuplicatedLodaerIdOutputed = false;

    messages.push(`${sectionStartPrefix}${chalk.blue(chalk.bold('Loaders'))}`);
    let allLoaderTime = 0;
    const nameGrouppedLoader = groupBy(prop('loaderPath'), data);
    Object.entries(nameGrouppedLoader).forEach(([loaderPath, dataA]) => {
        const loaderName = getLoaderName(loaderPath);
        if (option.ignoredLoaders.includes(loaderPath)) {
            messages.push(`${nextLinePrefix}Loader ${chalk.bold(loaderPath)} is ignored.`);
            return;
        }
        let currentLoaderTotalTime = 0;
        const idGroupedPlugin = groupBy(prop('callId'), dataA);
        Object.entries(idGroupedPlugin).forEach(([callId, dataB]) => {
            assert(dataB.length === 2
                && dataB[0].eventType === LoaderEventType.start
                && dataB[1].eventType === LoaderEventType.end
                , `each laoder execution should be collected info for start and end, once and only once. But for ${loaderPath}, there is an error, why?`);
            const tapTime = dataB[1].time - dataB[0].time;
            currentLoaderTotalTime += tapTime;
        });
        allLoaderTime += currentLoaderTotalTime;
        const loaderId = option.groupLoaderByPath ? loaderPath : loaderName;
        if (loaderIdSet.has(loaderId)) {
            isDuplicatedLodaerIdOutputed = true;
        }
        loaderIdSet.add(loaderId);
        messages.push(`${nextLinePrefix}Loader ${chalk.bold(loaderId)} takes ${prettyTime(currentLoaderTotalTime, option)}`);
    });
    if (isDuplicatedLodaerIdOutputed) {
        messages.push(`${nextLinePrefix}There are many differnt loaders that have same assumed name. Consider use "loader.groupedByAbsolutePath" option to show the full path of loaders.`);
    }
    messages.push(`${nextLinePrefix}All loaders take ${prettyTime(allLoaderTime, option)}`);
    return messages;
}

export const analyzer = new WebpackTimeAnalyzer();
