// import { fsyncSync, writeFileSync } from "fs";

// interface Writer {
//     flush: () => void;
//     write: (s: string) => void;
// }

// class FileWriter implements Writer {
//     constructor(public filePath: string) {
//         this.filePath = filePath;
//     }

//     flush() { 
//         writeFileSync();
//     }

//     write(s: string) { }
// }

// class StdoutWriter implements Writer {
//     flush() { }

//     write(s: string) { }
// }
