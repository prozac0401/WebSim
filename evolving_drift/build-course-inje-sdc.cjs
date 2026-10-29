#!/usr/bin/env node
'use strict';
require('./build-course-korea-utils.cjs').build('data/inje-sdc-source.json','inje-sdc.js','DriftInjeSdc',process.argv.includes('--check'));
