# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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

**Note:** Version bump only for package @eventual/integrations-slack

# 0.16.0 (2023-02-10)

### Features

- add support for typed APIs with zod ([#264](https://github.com/functionless/eventual/issues/264)) ([5b54ed3](https://github.com/functionless/eventual/commit/5b54ed3ea63b2a31c22ad82cb4f6640eca8738ed))

## 0.15.3 (2023-02-03)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.15.2 (2023-02-03)

### Bug Fixes

- make zod and openapi a dependency ([#270](https://github.com/functionless/eventual/issues/270)) ([dcbf312](https://github.com/functionless/eventual/commit/dcbf3121873552d6b5398ebda69edb935c8e66f7))

## 0.15.1 (2023-02-02)

**Note:** Version bump only for package @eventual/integrations-slack

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

**Note:** Version bump only for package @eventual/integrations-slack

# 0.13.0 (2023-01-31)

### Features

- remove dependency on node-fetch ([#258](https://github.com/functionless/eventual/issues/258)) ([cbedcbc](https://github.com/functionless/eventual/commit/cbedcbc5f3aacc4a3942ae9195ed81357deecf99))

## 0.12.5 (2023-01-30)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.12.4 (2023-01-27)

### Bug Fixes

- missing id in events ([#250](https://github.com/functionless/eventual/issues/250)) ([9eee09d](https://github.com/functionless/eventual/commit/9eee09d6a092a5f45b43dc625dc7c3ff95c4081a))

## 0.12.3 (2023-01-27)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.12.2 (2023-01-26)

### Bug Fixes

- **timeline:** encoding ([#242](https://github.com/functionless/eventual/issues/242)) ([2af8bfb](https://github.com/functionless/eventual/commit/2af8bfb28e66d9798e20cd73b7e5c0a4d7b0dd21))

## 0.12.1 (2023-01-19)

**Note:** Version bump only for package @eventual/integrations-slack

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

**Note:** Version bump only for package @eventual/integrations-slack

# 0.10.0 (2023-01-13)

### Features

- set up unit testing in project template ([#227](https://github.com/functionless/eventual/issues/227)) ([0811135](https://github.com/functionless/eventual/commit/08111359cacbb459595c37699a856febb226a18c))

## 0.9.4 (2023-01-13)

### Bug Fixes

- give physical names to Lambdas and the Execution LogGroup and simplify getting started ([#225](https://github.com/functionless/eventual/issues/225)) ([cd4d70d](https://github.com/functionless/eventual/commit/cd4d70db43a12f146ecaacb41643258c147face5))

## 0.9.3 (2023-01-12)

### Bug Fixes

- disable create test scripts ([4198ee8](https://github.com/functionless/eventual/commit/4198ee881d2b92cb469f032b6fdc41ddea065718))

## 0.9.2 (2023-01-12)

### Bug Fixes

- relative imports ([#222](https://github.com/functionless/eventual/issues/222)) ([fb0d28c](https://github.com/functionless/eventual/commit/fb0d28c4d50603c0682e7fecfc420ffb6ed843ab))

## 0.9.1 (2023-01-12)

**Note:** Version bump only for package @eventual/integrations-slack

# 0.9.0 (2023-01-11)

### Features

- cli and api improvements ([#213](https://github.com/functionless/eventual/issues/213)) ([5c5c6f0](https://github.com/functionless/eventual/commit/5c5c6f01abbe73fe9a960e645e4ba3dff034d71b))

## 0.8.7 (2023-01-11)

### Bug Fixes

- create-eventual creates a project with the user's choice of package manager based on npm_config_user_agent ([#214](https://github.com/functionless/eventual/issues/214)) ([afea433](https://github.com/functionless/eventual/commit/afea433c243a3e24b7eaee29d1a4b5e9e6cc5542))

## 0.8.6 (2023-01-10)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.8.5 (2023-01-10)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.8.4 (2023-01-09)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.8.3 (2023-01-07)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.8.2 (2023-01-06)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.8.1 (2023-01-06)

### Bug Fixes

- add missing peer dependencies on infra package ([#201](https://github.com/functionless/eventual/issues/201)) ([803bf90](https://github.com/functionless/eventual/commit/803bf904a94c06be19bb6758d17553e16ffaf9e4))

# 0.8.0 (2023-01-06)

### Features

- use verb resource pattern in the cli ([#197](https://github.com/functionless/eventual/issues/197)) ([6f542f7](https://github.com/functionless/eventual/commit/6f542f7f5cba5450408bbfddc9b4c01754b20df9))

## 0.7.9 (2023-01-06)

### Bug Fixes

- fail the workflow when the workflow name does not exist. ([#198](https://github.com/functionless/eventual/issues/198)) ([8775780](https://github.com/functionless/eventual/commit/87757801ac23902b6babf3986df86722d1e3cdbe))

## 0.7.8 (2023-01-06)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.7.7 (2023-01-05)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.7.6 (2023-01-04)

### Bug Fixes

- sst template lib in compilerOptions ([#196](https://github.com/functionless/eventual/issues/196)) ([8a7c71d](https://github.com/functionless/eventual/commit/8a7c71d0f2a8066c7732cadc06c02da2a5541af6))

## 0.7.5 (2023-01-03)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.7.4 (2023-01-03)

### Bug Fixes

- use npm or pnpm workspaces to avoid duplicate packages ([#194](https://github.com/functionless/eventual/issues/194)) ([46d9e7b](https://github.com/functionless/eventual/commit/46d9e7be01b331b97543cc709ab5f87c29313bf5))

## 0.7.3 (2023-01-03)

### Bug Fixes

- don't overwrite \_eventual ([#193](https://github.com/functionless/eventual/issues/193)) ([582bc87](https://github.com/functionless/eventual/commit/582bc872d7c6cf1b7828a8751d9c5ea207d528fb))

## 0.7.2 (2023-01-03)

### Bug Fixes

- create-eventual aws-cdk and getting started ([#189](https://github.com/functionless/eventual/issues/189)) ([4e6d707](https://github.com/functionless/eventual/commit/4e6d7073c115a3836c2f30dfd02fa12dab597e35))

## 0.7.1 (2023-01-03)

### Bug Fixes

- import issues ([#191](https://github.com/functionless/eventual/issues/191)) ([fee79d4](https://github.com/functionless/eventual/commit/fee79d45da9b13e49ce4cb61d6d8ce7d2bc8647e))

# 0.7.0 (2023-01-03)

### Features

- add service info cli ([#187](https://github.com/functionless/eventual/issues/187)) ([f613910](https://github.com/functionless/eventual/commit/f6139106be0f4e2caa5ee700c194a99dbeeada9a))

## 0.6.1 (2023-01-02)

### Bug Fixes

- missing publish config ([#186](https://github.com/functionless/eventual/issues/186)) ([3499d20](https://github.com/functionless/eventual/commit/3499d20649bb7ca493255608c0f516759724f6b7))

# 0.6.0 (2023-01-02)

### Features

- make service optional, add service env and inference ([#178](https://github.com/functionless/eventual/issues/178)) ([5f11432](https://github.com/functionless/eventual/commit/5f114326ef1191483c880b37fc2cb6bad3e5a9d1))

## 0.5.2 (2023-01-02)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.5.1 (2023-01-02)

**Note:** Version bump only for package @eventual/integrations-slack

# 0.5.0 (2023-01-02)

### Features

- service client ([#171](https://github.com/functionless/eventual/issues/171)) ([6d27602](https://github.com/functionless/eventual/commit/6d2760270404d7e286bd411259f21e70d2568cb9))

## 0.4.3 (2022-12-31)

**Note:** Version bump only for package @eventual/integrations-slack

## 0.4.2 (2022-12-30)

### Bug Fixes

- put create-eventual bundle in lib/ for turbo cache ([#165](https://github.com/functionless/eventual/issues/165)) ([5108a9b](https://github.com/functionless/eventual/commit/5108a9bdc2384d721a88e2652ca378090f56cda3))

## 0.4.1 (2022-12-30)

### Bug Fixes

- bundle create-eventual as index.js ([#164](https://github.com/functionless/eventual/issues/164)) ([0e6667c](https://github.com/functionless/eventual/commit/0e6667c94e59aafd712fa1189f378ffbdd38b056))

# 0.4.0 (2022-12-30)

### Features

- unit testing runtime ([#125](https://github.com/functionless/eventual/issues/125)) ([64447c3](https://github.com/functionless/eventual/commit/64447c3817e8b1ab4460b756fa319134cbb424e6))

## 0.3.1 (2022-12-29)

### Bug Fixes

- allow dashes in a project name ([#154](https://github.com/functionless/eventual/issues/154)) ([4f68d2f](https://github.com/functionless/eventual/commit/4f68d2fb7e7ffc500a4f7c59ddfbff3341158b41))

# 0.3.0 (2022-12-29)

### Features

- add create-eventual script supporting aws-cdk and aws-sst ([#113](https://github.com/functionless/eventual/issues/113)) ([2413340](https://github.com/functionless/eventual/commit/2413340f34fbde1e9d52897a4aee58d8c94025d4))

# 0.2.0 (2022-12-21)

### Features

- support eventual-infer on .ts using esbuild ([#132](https://github.com/functionless/eventual/issues/132)) ([0f4259f](https://github.com/functionless/eventual/commit/0f4259f0ca42efcd5ff2803af11bee2a46ed0186))

## 0.1.1 (2022-12-21)

### Bug Fixes

- take peer on ^2.50.0 or AWS CDK ([#126](https://github.com/functionless/eventual/issues/126)) ([fe850bb](https://github.com/functionless/eventual/commit/fe850bb180bb7e599fae91346b244cd0e50cbbe3))

# 0.1.0 (2022-12-21)

### Features

- add signal function ([#129](https://github.com/functionless/eventual/issues/129)) ([8c43568](https://github.com/functionless/eventual/commit/8c43568a19c36a2792d440520d9606d03c57e606))

## 0.0.1 (2022-12-19)

**Note:** Version bump only for package @eventual/integrations-slack
