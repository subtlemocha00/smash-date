import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";

export default [
    {
        // dist: build output. design: standalone design-kit prototypes (CDN-based,
        // not part of the app's Vite build) — linting them is noise.
        ignores: ["dist", "design"]
    },

    js.configs.recommended,

    {
        files: ["**/*.{js,jsx}"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",

            globals: {
                ...globals.browser
            },

            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                }
            }
        },

        settings: {
            react: { version: "detect" }
        },

        plugins: {
            react,
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh
        },

        rules: {
            ...reactHooks.configs.recommended.rules,

            // Mark identifiers referenced in JSX (e.g. <LoginPage />) as used so
            // core no-unused-vars stops flagging component imports as unused.
            "react/jsx-uses-vars": "error",
            // Automatic JSX runtime (@vitejs/plugin-react) — React need not be in scope.
            "react/jsx-uses-react": "off",
            "react/react-in-jsx-scope": "off",

            "react-refresh/only-export-components": [
                "warn",
                { allowConstantExport: true }
            ]
        }
    },

    prettier
];