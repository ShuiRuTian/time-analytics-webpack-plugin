import { PACKAGE_NAME } from './const';
import { fail } from './utils';

export enum TapType {
    normal,
    async,
    promise,
}

export interface AnalyzeInfo {
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
    tapType:TapType;
    /**
     * ID for each tap call.
     */
    tapCallId:string;
}

class WebpackTimeAnalyzer {
    private _isInitilized = false;

    initilize() {
        if (this._isInitilized) {
            fail(`${PACKAGE_NAME} is initialized twice, why do you do this? Please submit an issue.`);
        }
        this._isInitilized = true;
    }

    collectInfo(analyzeInfo: AnalyzeInfo) { }
}

export const analyzer = new WebpackTimeAnalyzer();
