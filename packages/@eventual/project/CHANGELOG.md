# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## 0.18.2 (2023-02-15)

### Bug Fixes

- start, child completion, and activity result durability ([#282](https://github.com/functionless/eventual/issues/282)) ([3016b0d](https://github.com/functionless/eventual/commit/3016b0d0c1d7e9e00cc6b47270ea5135aff889f6))

## 0.18.1 (2023-02-15)

### Bug Fixes

- don't carry a Command's context through to the client ([#287](https://github.com/functionless/eventual/issues/287)) ([1ce652a](https://github.com/functionless/eventual/commit/1ce652af503c95cad91e47a4f0da4efba43b2fed))

# 0.18.0 (2023-02-14)

### Features

- add Subscription concept ([#284](https://github.com/functionless/eventual/issues/284)) ([2bc4eca](https://github.com/functionless/eventual/commit/2bc4ecab66c46fe5130a30c8a3789dd1a53b9353))

# 0.17.0 (2023-02-14)

### Features

- add middleware for APIs and Commands ([#281](https://github.com/functionless/eventual/issues/281)) ([ffa9b3c](https://github.com/functionless/eventual/commit/ffa9b3c85e205ba07bd30156bb3a6a02fcf029a1))

## 0.16.2 (2023-02-13)

### Bug Fixes

- filter out only Command types on ServiceClient ([#280](https://github.com/functionless/eventual/issues/280)) ([bd6844d](https://github.com/functionless/eventual/commit/bd6844d2c0f767cd3255985bd18d15a8909b1f0f))

## 0.16.1 (2023-02-12)

**Note:** Version bump only for package @eventual/project

# 0.16.0 (2023-02-10)

### Features

- add support for typed APIs with zod ([#264](https://github.com/functionless/eventual/issues/264)) ([5b54ed3](https://github.com/functionless/eventual/commit/5b54ed3ea63b2a31c22ad82cb4f6640eca8738ed))

## 0.15.3 (2023-02-03)

**Note:** Version bump only for package @eventual/project

## 0.15.2 (2023-02-03)

### Bug Fixes

- make zod and openapi a dependency ([#270](https://github.com/functionless/eventual/issues/270)) ([dcbf312](https://github.com/functionless/eventual/commit/dcbf3121873552d6b5398ebda69edb935c8e66f7))

## 0.15.1 (2023-02-02)

**Note:** Version bump only for package @eventual/project

# 0.15.0 (2023-02-02)

### Features

- support Zod Schemas on event declarations for validation and SchemaRegistry configuration ([#263](https://github.com/functionless/eventual/issues/263)) ([a9ce175](https://github.com/functionless/eventual/commit/a9ce175127f6a332be34683b5753059a53891d4c))

## 0.14.1 (2023-02-02)

### Bug Fixes

- create eventual does not use own version ([#267](https://github.com/functionless/eventual/issues/267)) ([623a51f](https://github.com/functionless/eventual/commit/623a51f7f6a1bcf62c78fdbec831a3244dc89d0a))

# 0.14.0 (2023-02-01)

### Features

- infer memorySize, timeout, fileName and exportName from api route code ([#254](https://github.com/functionless/eventual/issues/254)) ([2d8297a](https://github.com/functionless/eventual/commit/2d8297a8f39d6244e2d2468e9ef44a64bcefb9d1))

## 0.13.2 (2023-01-31)

### Bug Fixes

- replay was broken ([#260](https://github.com/functionless/eventual/issues/260)) ([53eab42](https://github.com/functionless/eventual/commit/53eab42cd139ba850841f2203d23d1509c080851))

## 0.13.1 (2023-01-31)

**Note:** Version bump only for package @eventual/project

# 0.13.0 (2023-01-31)

### Features

- remove dependency on node-fetch ([#258](https://github.com/functionless/eventual/issues/258)) ([cbedcbc](https://github.com/functionless/eventual/commit/cbedcbc5f3aacc4a3942ae9195ed81357deecf99))

## 0.12.5 (2023-01-30)

**Note:** Version bump only for package @eventual/project

## 0.12.4 (2023-01-27)

### Bug Fixes

- missing id in events ([#250](https://github.com/functionless/eventual/issues/250)) ([9eee09d](https://github.com/functionless/eventual/commit/9eee09d6a092a5f45b43dc625dc7c3ff95c4081a))

## 0.12.3 (2023-01-27)

**Note:** Version bump only for package @eventual/project

## 0.12.2 (2023-01-26)

### Bug Fixes

- **timeline:** encoding ([#242](https://github.com/functionless/eventual/issues/242)) ([2af8bfb](https://github.com/functionless/eventual/commit/2af8bfb28e66d9798e20cd73b7e5c0a4d7b0dd21))

## 0.12.1 (2023-01-19)

**Note:** Version bump only for package @eventual/project

# 0.12.0 (2023-01-17)

### Features

- datetime ([#234](https://github.com/functionless/eventual/issues/234)) ([e544da5](https://github.com/functionless/eventual/commit/e544da580c58b0a7e1c489bad0cbfb045680948e))

## 0.11.1 (2023-01-15)

### Bug Fixes

- configure @types/jest at root to avoid vs code confusion ([#230](https://github.com/functionless/eventual/issues/230)) ([fcf69d3](https://github.com/functionless/eventual/commit/fcf69d3246c6e75da2be3130a8e70f6ca5863efa))

# 0.11.0 (2023-01-15)

### Features

- replace sleep with time and duration ([#221](https://github.com/functionless/eventual/issues/221)) ([27fc1fa](https://github.com/functionless/eventual/commit/27fc1faaed20ec7d65bbd5c0c2bf4fb2a6745e48))

## 0.10.1 (2023-01-13)

**Note:** Version bump only for package @eventual/project

# 0.10.0 (2023-01-13)

### Features

- set up unit testing in project template ([#227](https://github.com/functionless/eventual/issues/227)) ([0811135](https://github.com/functionless/eventual/commit/08111359cacbb459595c37699a856febb226a18c))

## 0.9.4 (2023-01-13)

### Bug Fixes

- give physical names to Lambdas and the Execution LogGroup and simplify getting started ([#225](https://github.com/functionless/eventual/issues/225)) ([cd4d70d](https://github.com/functionless/eventual/commit/cd4d70db43a12f146ecaacb41643258c147face5))

## 0.9.3 (2023-01-12)

### Bug Fixes

- disable create test scripts ([4198ee8](https://github.com/functionless/eventual/commit/4198ee881d2b92cb469f032b6fdc41ddea065718))
