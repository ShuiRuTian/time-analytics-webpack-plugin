module.exports = {
    env: {
        node: true,
    },
    parser: "@typescript-eslint/parser",
    plugins: [
        'import',
        '@typescript-eslint',
    ],
    parserOptions: {
        // follow the recommandation https://github.com/typescript-eslint/typescript-eslint/issues/890
        project: './tsconfig.eslint.json',
    },
    extends: [
        'airbnb-typescript/base',
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    rules: {
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/ban-ts-comment": "off",
        "@typescript-eslint/indent": "off",
        "@typescript-eslint/no-use-before-define": ["error", { "functions": false }]
    },
};