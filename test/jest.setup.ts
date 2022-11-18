import shelljs from 'shelljs';
import { MONOREPO_FOLDER_PATH } from './util';

require('ts-node').register({ transpileOnly: true });

const setup = (): void => {
    shelljs.pushd();
    shelljs.cd(MONOREPO_FOLDER_PATH);
    shelljs.exec('pnpm i');
    shelljs.popd();
};

export default setup;