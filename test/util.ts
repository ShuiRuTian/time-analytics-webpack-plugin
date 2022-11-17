import { assert } from "@src/utils";
import { existsSync } from "fs";
import path from "path";

const MONOREPO_FOLDER_PATH = path.join(__dirname, 'monorepos');

assert(existsSync(MONOREPO_FOLDER_PATH), 'could not found monorepo folder, which is the root of each real test cases');

export { MONOREPO_FOLDER_PATH };