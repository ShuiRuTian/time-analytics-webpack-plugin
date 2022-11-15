import { PACKAGE_NAME } from './const';
import { fail } from './utils';

class WebpackTimeAnalyzer {
    private _isInitilized = false;

    initilize() {
        if (this._isInitilized) {
            fail(`${PACKAGE_NAME} is initialized twice, why do you do this? Please submit an issue.`);
        }
        this._isInitilized = true;
    }
}

export const analyzer = new WebpackTimeAnalyzer();
