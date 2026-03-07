module.exports = [
    {
        ignores: ["coverage/**", "dist/**", "node_modules/**", "*.iml"],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 8,
            sourceType: "commonjs",
        },
        rules: {
            "brace-style": ["error", "1tbs"],
            "keyword-spacing": "error",
            "no-multi-spaces": "error",
            "max-len": ["error", { code: 120, ignoreComments: true }],
            "no-trailing-spaces": "error",
            indent: ["error", 4],
        },
    },
];
