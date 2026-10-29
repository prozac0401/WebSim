#!/usr/bin/env node
'use strict';
require('./build-course-korea-utils.cjs').build('data/kic-sdc-source.json','kic-sdc.js','DriftKicSdc',process.argv.includes('--check'));
